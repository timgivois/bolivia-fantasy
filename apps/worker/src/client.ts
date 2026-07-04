/**
 * API-Football (api-sports.io v3) HTTP client.
 *
 * - `fetch` is injectable so tests (and the sandboxed CI) never hit the
 *   real network.
 * - Handles the provider's HTTP-200-with-errors convention: a 200 response
 *   whose `errors` field is a non-empty object/array is a failure.
 * - Enforces the free-tier per-minute rate limit (10 req/min) with a
 *   sliding-window throttle (injectable clock/sleep for tests).
 * - Every request first passes through the daily request budgeter.
 */

export const API_FOOTBALL_BASE_URL = "https://v3.football.api-sports.io";
export const BOLIVIA_LEAGUE_ID = 344;
export const MAX_REQUESTS_PER_MINUTE = 10;

/** Envelope every API-Football v3 endpoint returns. */
export interface ApiEnvelope<T> {
  get: string;
  parameters: Record<string, string>;
  errors: unknown;
  results: number;
  paging: { current: number; total: number };
  response: T[];
}

export class ApiFootballError extends Error {
  override readonly name = "ApiFootballError";
  constructor(
    readonly path: string,
    readonly status: number,
    readonly apiErrors: unknown,
  ) {
    super(
      `API-Football error on ${path} (HTTP ${status}): ${JSON.stringify(apiErrors)}`,
    );
  }
}

/** The subset of the request budgeter the client needs (see budget.ts). */
export interface RequestBudgetLike {
  /** Consume one request from today's budget or throw BudgetExceededError. */
  consume(endpoint: string): Promise<number>;
}

export interface ApiFootballClientOptions {
  /** Defaults to process.env.API_FOOTBALL_KEY. */
  apiKey?: string;
  /** Defaults to the production base URL. */
  baseUrl?: string;
  /** Injectable fetch; defaults to globalThis.fetch. */
  fetchImpl?: typeof fetch;
  /** Daily request budgeter; every call is charged before it is made. */
  budget?: RequestBudgetLike;
  /** Sliding-window per-minute limit; defaults to 10 (free tier). */
  maxRequestsPerMinute?: number;
  /** Injectable clock (ms) for tests. */
  now?: () => number;
  /** Injectable sleep for tests. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** True when the API "errors" field (object or array) contains errors. */
export function hasApiErrors(errors: unknown): boolean {
  if (!errors) return false;
  if (Array.isArray(errors)) return errors.length > 0;
  if (typeof errors === "object") return Object.keys(errors).length > 0;
  return false;
}

export class ApiFootballClient {
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly budget: RequestBudgetLike | undefined;
  private readonly maxPerMinute: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  /** Timestamps (ms) of requests made in the current sliding window. */
  private readonly sent: number[] = [];

  constructor(options: ApiFootballClientOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.API_FOOTBALL_KEY;
    this.baseUrl = options.baseUrl ?? API_FOOTBALL_BASE_URL;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.budget = options.budget;
    this.maxPerMinute = options.maxRequestsPerMinute ?? MAX_REQUESTS_PER_MINUTE;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? defaultSleep;
  }

  /** Wait until a request slot is free in the 60s sliding window. */
  private async throttle(): Promise<void> {
    for (;;) {
      const cutoff = this.now() - 60_000;
      while (this.sent.length > 0 && (this.sent[0] as number) <= cutoff) {
        this.sent.shift();
      }
      if (this.sent.length < this.maxPerMinute) return;
      const oldest = this.sent[0] as number;
      await this.sleep(Math.max(oldest + 60_000 - this.now(), 1));
    }
  }

  /**
   * GET {baseUrl}{path}?{params}. Charges the budget, throttles, then
   * fetches. Throws ApiFootballError on HTTP errors or the 200-with-errors
   * convention.
   */
  async get<T>(
    path: string,
    params: Record<string, string | number> = {},
  ): Promise<ApiEnvelope<T>> {
    if (!this.apiKey) {
      throw new Error(
        "API_FOOTBALL_KEY is not set; cannot call API-Football.",
      );
    }
    if (this.budget) await this.budget.consume(path);
    await this.throttle();

    const url = new URL(this.baseUrl + path);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }

    this.sent.push(this.now());
    const res = await this.fetchImpl(url.toString(), {
      headers: { "x-apisports-key": this.apiKey },
    });

    let body: unknown;
    try {
      body = await res.json();
    } catch (err) {
      throw new ApiFootballError(path, res.status, `unparseable body: ${String(err)}`);
    }

    const envelope = body as ApiEnvelope<T>;
    if (!res.ok || hasApiErrors(envelope?.errors)) {
      throw new ApiFootballError(path, res.status, envelope?.errors ?? null);
    }
    return envelope;
  }

  /**
   * Pagination helper: follows `paging.current/total`, concatenating every
   * page's `response` array. Hard-capped at 50 pages as a safety net.
   */
  async getPaged<T>(
    path: string,
    params: Record<string, string | number> = {},
  ): Promise<T[]> {
    const all: T[] = [];
    let page = 1;
    for (;;) {
      const envelope = await this.get<T>(path, { ...params, page });
      all.push(...envelope.response);
      const current = envelope.paging?.current ?? page;
      const total = envelope.paging?.total ?? 1;
      if (current >= total || page >= 50) break;
      page = current + 1;
    }
    return all;
  }
}
