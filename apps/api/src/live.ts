import type { Pool, PoolClient } from "pg";

export const LIVE_CHANNEL = "live_scores";

type Subscriber = (payload: string) => void;

/**
 * Fans a single Postgres LISTEN connection out to any number of SSE
 * subscribers. The dedicated client is acquired lazily on the first
 * subscriber and released when the last one leaves (or on close()).
 */
export class LiveBroadcaster {
  private readonly pool: Pool;
  private readonly subscribers = new Set<Subscriber>();
  private client: PoolClient | null = null;
  private connecting: Promise<void> | null = null;
  private closed = false;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async subscribe(subscriber: Subscriber): Promise<() => void> {
    if (this.closed) throw new Error("LiveBroadcaster is closed");
    this.subscribers.add(subscriber);
    try {
      await this.ensureListening();
    } catch (error) {
      this.subscribers.delete(subscriber);
      throw error;
    }
    return () => {
      this.subscribers.delete(subscriber);
      if (this.subscribers.size === 0) void this.releaseClient();
    };
  }

  async close(): Promise<void> {
    this.closed = true;
    this.subscribers.clear();
    await this.releaseClient();
  }

  private async ensureListening(): Promise<void> {
    if (this.client) return;
    this.connecting ??= (async () => {
      const client = await this.pool.connect();
      try {
        client.on("notification", (message) => {
          if (message.channel !== LIVE_CHANNEL) return;
          const payload = message.payload ?? "";
          for (const subscriber of this.subscribers) subscriber(payload);
        });
        // If the LISTEN connection dies, drop it; the next subscriber
        // (or the next subscribe call) re-establishes it.
        client.on("error", () => void this.releaseClient(true));
        await client.query(`LISTEN ${LIVE_CHANNEL}`);
        this.client = client;
      } catch (error) {
        client.release(true);
        throw error;
      }
    })().finally(() => {
      this.connecting = null;
    });
    await this.connecting;
  }

  private async releaseClient(destroy = false): Promise<void> {
    const client = this.client;
    this.client = null;
    if (!client) return;
    client.removeAllListeners("notification");
    if (!destroy) {
      try {
        await client.query(`UNLISTEN ${LIVE_CHANNEL}`);
      } catch {
        destroy = true;
      }
    }
    client.release(destroy);
  }
}
