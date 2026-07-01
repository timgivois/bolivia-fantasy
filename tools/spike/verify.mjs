#!/usr/bin/env node
/**
 * Verification spike: API-Football (api-sports.io v3) coverage of
 * Bolivia's Primera Division (league id 344).
 *
 * Decision gate for the fantasy-league scoring design:
 *   PLAYER_STATS_OK -> full FPL-style scoring (per-fixture player stats)
 *   EVENTS_ONLY     -> scoring from match events only (goals/assists/cards/subs)
 *   INSUFFICIENT    -> re-evaluate provider (BeSoccer / Sportmonks)
 *
 * Zero dependencies. Node >= 18 (native fetch). Run:
 *   API_FOOTBALL_KEY=xxx node verify.mjs
 */

const BASE_URL = 'https://v3.football.api-sports.io';
const LEAGUE_ID = 344; // Bolivia - Primera Division
// Free tier: 10 requests/minute -> sleep ~6.5s between calls to stay safe.
const THROTTLE_MS = 6500;

const API_KEY = process.env.API_FOOTBALL_KEY;

if (!API_KEY) {
  console.error(
    [
      '',
      'ERROR: falta la variable de entorno API_FOOTBALL_KEY.',
      'ERROR: missing API_FOOTBALL_KEY environment variable.',
      '',
      'ES: Obtene una clave gratuita en https://dashboard.api-football.com/register',
      '    y ejecuta:  API_FOOTBALL_KEY=tu_clave pnpm --filter @bolivia-fantasy/spike verify',
      'EN: Get a free key at https://dashboard.api-football.com/register',
      '    then run:  API_FOOTBALL_KEY=your_key pnpm --filter @bolivia-fantasy/spike verify',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

let requestCount = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** True if the API "errors" field (object or array) actually contains errors. */
function hasApiErrors(errors) {
  if (!errors) return false;
  if (Array.isArray(errors)) return errors.length > 0;
  if (typeof errors === 'object') return Object.keys(errors).length > 0;
  return false;
}

function isRateLimitError(status, errors) {
  if (status === 429) return true;
  if (errors && typeof errors === 'object' && !Array.isArray(errors)) {
    const keys = Object.keys(errors).map((k) => k.toLowerCase());
    return keys.some((k) => k.includes('ratelimit') || k.includes('requests'));
  }
  return false;
}

/**
 * GET {BASE_URL}{path}?{params}. Handles the API convention of returning
 * HTTP 200 with a populated "errors" field for auth/rate/plan issues.
 * Retries once on rate-limit (waits 60s). Never throws: returns
 * { ok, data, error }.
 */
async function apiGet(path, params = {}, { isRetry = false } = {}) {
  const url = new URL(BASE_URL + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  requestCount += 1;
  console.log(`\n--> GET ${url.pathname}${url.search} (request #${requestCount})`);

  let res;
  let data;
  try {
    res = await fetch(url, { headers: { 'x-apisports-key': API_KEY } });
    data = await res.json();
  } catch (err) {
    return { ok: false, data: null, error: `network/parse error: ${err?.message ?? err}` };
  }

  const errors = data?.errors;
  if (hasApiErrors(errors) || !res.ok) {
    const errText = JSON.stringify(errors ?? `HTTP ${res.status}`);
    if (isRateLimitError(res.status, errors) && !isRetry) {
      console.warn(`    Rate limited (${errText}). Waiting 60s and retrying once...`);
      await sleep(60_000);
      requestCount -= 1; // apiGet re-increments on retry; count the retry itself below
      const retry = await apiGet(path, params, { isRetry: true });
      requestCount += 1; // the original 429 also consumed a request slot
      return retry;
    }
    return { ok: false, data, error: `API error(s): ${errText} (HTTP ${res.status})` };
  }

  return { ok: true, data, error: null };
}

/** Throttled apiGet: sleeps first so we respect 10 req/min on the free tier. */
async function throttledGet(path, params) {
  console.log(`    (sleeping ${THROTTLE_MS / 1000}s to respect free-tier rate limit)`);
  await sleep(THROTTLE_MS);
  return apiGet(path, params);
}

const pad = (v, w) => String(v ?? '-').padEnd(w).slice(0, w);
const heading = (t) => console.log(`\n${'='.repeat(70)}\n${t}\n${'='.repeat(70)}`);

async function main() {
  const findings = {
    coverageStatsPlayers: false,
    coverageEvents: false,
    playerStatsPopulated: false, // real minutes + goals present in fixture stats
    eventsPopulated: false,
    problems: [],
  };

  // ---------------------------------------------------------------- (a) status
  heading('(a) GET /status — account / quota');
  const status = await apiGet('/status');
  if (status.ok) {
    const r = status.data?.response?.requests;
    const sub = status.data?.response?.subscription;
    console.log(`Plan: ${sub?.plan ?? '?'} (active: ${sub?.active ?? '?'})`);
    console.log(`Requests today: ${r?.current ?? '?'} / ${r?.limit_day ?? '?'}`);
  } else {
    console.error(`Status check failed: ${status.error}`);
    findings.problems.push(`/status failed: ${status.error}`);
  }

  // ------------------------------------------------------- (b) league coverage
  heading(`(b) GET /leagues?id=${LEAGUE_ID} — seasons & coverage flags`);
  const leagues = await throttledGet('/leagues', { id: LEAGUE_ID });
  let seasons = [];
  if (leagues.ok && leagues.data?.response?.length) {
    const entry = leagues.data.response[0];
    console.log(`League: ${entry.league?.name} (${entry.country?.name})`);
    seasons = entry.seasons ?? [];
    const FLAGS = [
      ['fixtures.events', (c) => c?.fixtures?.events],
      ['fixtures.lineups', (c) => c?.fixtures?.lineups],
      ['fixtures.statistics_fixtures', (c) => c?.fixtures?.statistics_fixtures],
      ['fixtures.statistics_players', (c) => c?.fixtures?.statistics_players],
      ['standings', (c) => c?.standings],
      ['players', (c) => c?.players],
      ['top_scorers', (c) => c?.top_scorers],
      ['injuries', (c) => c?.injuries],
      ['predictions', (c) => c?.predictions],
      ['odds', (c) => c?.odds],
    ];
    for (const s of seasons) {
      console.log(`\nSeason ${s.year}${s.current ? ' (current)' : ''}  [${s.start} .. ${s.end}]`);
      for (const [label, get] of FLAGS) {
        console.log(`  ${pad(label, 32)} ${get(s.coverage) ? 'YES' : 'no'}`);
      }
    }
  } else {
    console.error(`Leagues call failed: ${leagues.error ?? 'empty response'}`);
    findings.problems.push(`/leagues failed: ${leagues.error ?? 'empty response'}`);
  }

  // Determine current/latest season.
  const currentSeason = seasons.find((s) => s.current);
  const latestSeason =
    currentSeason ??
    [...seasons].sort((a, b) => (b.year ?? 0) - (a.year ?? 0))[0] ??
    null;
  const seasonYear = latestSeason?.year ?? new Date().getFullYear();
  findings.coverageStatsPlayers = Boolean(latestSeason?.coverage?.fixtures?.statistics_players);
  findings.coverageEvents = Boolean(latestSeason?.coverage?.fixtures?.events);
  console.log(`\nUsing season: ${seasonYear}${currentSeason ? ' (flagged current)' : ' (latest available)'}`);

  // ------------------------------------------------------------- (c) fixtures
  heading(`(c) GET /fixtures?league=${LEAGUE_ID}&season=${seasonYear} — fixture inventory`);
  const fixtures = await throttledGet('/fixtures', { league: LEAGUE_ID, season: seasonYear });
  let finished = [];
  if (fixtures.ok && Array.isArray(fixtures.data?.response)) {
    const all = fixtures.data.response;
    console.log(`Total fixtures: ${all.length}`);
    const byStatus = {};
    for (const f of all) {
      const st = f.fixture?.status?.short ?? '??';
      byStatus[st] = (byStatus[st] ?? 0) + 1;
    }
    console.log('Counts by status:');
    for (const [st, n] of Object.entries(byStatus).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${pad(st, 6)} ${n}`);
    }
    finished = all
      .filter((f) => f.fixture?.status?.short === 'FT')
      .sort((a, b) => new Date(b.fixture?.date ?? 0) - new Date(a.fixture?.date ?? 0));
    console.log(`\n5 most recent finished (FT) fixtures:`);
    if (finished.length === 0) {
      console.log('  NONE — no FT fixtures found for this season.');
      findings.problems.push('No finished (FT) fixtures found for latest season.');
    }
    for (const f of finished.slice(0, 5)) {
      console.log(
        `  id=${pad(f.fixture?.id, 8)} ${pad((f.fixture?.date ?? '').slice(0, 10), 11)} ` +
          `${pad(f.teams?.home?.name, 22)} ${f.goals?.home ?? '-'}-${f.goals?.away ?? '-'} ` +
          `${f.teams?.away?.name ?? '-'}`,
      );
    }
  } else {
    console.error(`Fixtures call failed: ${fixtures.error ?? 'empty response'}`);
    findings.problems.push(`/fixtures failed: ${fixtures.error ?? 'empty response'}`);
  }

  // --------------------------------------------- (d) per-fixture player stats
  heading('(d) GET /fixtures/players — per-fixture player statistics (up to 3 fixtures)');
  const sampleFixtures = finished.slice(0, 3);
  if (sampleFixtures.length === 0) {
    console.log('SKIPPED — no finished fixtures available to sample.');
  }
  for (const f of sampleFixtures) {
    const id = f.fixture?.id;
    const label = `${f.teams?.home?.name} vs ${f.teams?.away?.name} (${(f.fixture?.date ?? '').slice(0, 10)})`;
    const stats = await throttledGet('/fixtures/players', { fixture: id });
    console.log(`\nFixture ${id}: ${label}`);
    if (!stats.ok) {
      console.error(`  FAILED: ${stats.error}`);
      findings.problems.push(`/fixtures/players?fixture=${id} failed: ${stats.error}`);
      continue;
    }
    const teams = stats.data?.response ?? [];
    if (teams.length === 0) {
      console.log('  FLAG: response array is EMPTY — no player stats for this fixture.');
      findings.problems.push(`Fixture ${id}: empty /fixtures/players response.`);
      continue;
    }
    // Flatten players across both teams.
    const rows = [];
    for (const t of teams) {
      for (const p of t.players ?? []) {
        const s = p.statistics?.[0] ?? {};
        rows.push({
          name: p.player?.name,
          team: t.team?.name,
          minutes: s.games?.minutes,
          rating: s.games?.rating,
          goals: s.goals?.total,
          assists: s.goals?.assists,
          shots: s.shots?.total,
          yellow: s.cards?.yellow,
          red: s.cards?.red,
        });
      }
    }
    if (rows.length === 0) {
      console.log('  FLAG: teams present but players arrays are EMPTY.');
      findings.problems.push(`Fixture ${id}: players arrays empty.`);
      continue;
    }
    const withMinutes = rows.filter((r) => typeof r.minutes === 'number' && r.minutes > 0);
    const withRating = rows.filter((r) => r.rating != null);
    console.log(
      `  players=${rows.length}  with minutes>0: ${withMinutes.length}  with rating: ${withRating.length}`,
    );
    if (withMinutes.length === 0) {
      console.log('  FLAG: all minutes are null/0 — stats look UNPOPULATED.');
      findings.problems.push(`Fixture ${id}: minutes all null/0.`);
    } else {
      findings.playerStatsPopulated = true;
    }
    if (withRating.length === 0) {
      console.log('  FLAG: all ratings are null.');
    }
    const top = [...rows]
      .sort((a, b) => (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0) || (b.minutes ?? 0) - (a.minutes ?? 0))
      .slice(0, 8);
    console.log(
      `  ${pad('player', 24)} ${pad('min', 4)} ${pad('rat', 5)} ${pad('gls', 4)} ${pad('ast', 4)} ${pad('sht', 4)} ${pad('Y/R', 5)}`,
    );
    for (const r of top) {
      console.log(
        `  ${pad(r.name, 24)} ${pad(r.minutes, 4)} ${pad(r.rating, 5)} ${pad(r.goals ?? 0, 4)} ` +
          `${pad(r.assists ?? 0, 4)} ${pad(r.shots ?? 0, 4)} ${pad(`${r.yellow ?? 0}/${r.red ?? 0}`, 5)}`,
      );
    }
  }

  // ----------------------------------------------------------- (e) events
  heading('(e) GET /fixtures/events — match events (1 fixture)');
  if (finished.length === 0) {
    console.log('SKIPPED — no finished fixtures available.');
  } else {
    const id = finished[0].fixture?.id;
    const events = await throttledGet('/fixtures/events', { fixture: id });
    if (!events.ok) {
      console.error(`  FAILED: ${events.error}`);
      findings.problems.push(`/fixtures/events?fixture=${id} failed: ${events.error}`);
    } else {
      const evs = events.data?.response ?? [];
      const count = (type) => evs.filter((e) => e.type === type).length;
      console.log(`Fixture ${id}: ${evs.length} events total`);
      console.log(`  Goals: ${count('Goal')}  Cards: ${count('Card')}  Subs: ${count('subst')}`);
      if (evs.length === 0) {
        console.log('  FLAG: events array is EMPTY.');
        findings.problems.push(`Fixture ${id}: empty events array.`);
      } else {
        findings.eventsPopulated = true;
        console.log('  Samples:');
        for (const e of evs.slice(0, 5)) {
          console.log(
            `    ${pad(`${e.time?.elapsed ?? '?'}'`, 5)} ${pad(e.type, 6)} ${pad(e.detail, 22)} ` +
              `${pad(e.player?.name, 22)} (${e.team?.name ?? '?'})` +
              (e.assist?.name ? ` assist: ${e.assist.name}` : ''),
          );
        }
      }
    }
  }

  // --------------------------------------------- (f) season-aggregate players
  heading(`(f) GET /players?league=${LEAGUE_ID}&season=${seasonYear}&page=1 — season aggregates`);
  const players = await throttledGet('/players', { league: LEAGUE_ID, season: seasonYear, page: 1 });
  if (!players.ok) {
    console.error(`  FAILED: ${players.error}`);
    findings.problems.push(`/players failed: ${players.error}`);
  } else {
    const paging = players.data?.paging;
    console.log(
      `Total results: ${players.data?.results ?? '?'} on this page — pages: ${paging?.current ?? '?'} / ${paging?.total ?? '?'}`,
    );
    const sample = (players.data?.response ?? []).slice(0, 3);
    if (sample.length === 0) {
      console.log('  FLAG: players response is EMPTY.');
      findings.problems.push('/players returned empty response.');
    }
    for (const p of sample) {
      const s = p.statistics?.[0] ?? {};
      console.log(
        `  ${pad(p.player?.name, 24)} team=${pad(s.team?.name, 20)} apps=${pad(s.games?.appearences, 4)} ` +
          `min=${pad(s.games?.minutes, 5)} rating=${pad(s.games?.rating, 5)} goals=${pad(s.goals?.total ?? 0, 3)} ` +
          `assists=${s.goals?.assists ?? 0}`,
      );
    }
  }

  // ------------------------------------------------------------------ verdict
  heading('VERDICT SUMMARY');
  let verdict;
  if (findings.coverageStatsPlayers && findings.playerStatsPopulated) {
    verdict = 'PLAYER_STATS_OK';
  } else if (findings.eventsPopulated || findings.coverageEvents) {
    verdict = 'EVENTS_ONLY';
  } else {
    verdict = 'INSUFFICIENT';
  }
  console.log(`Coverage flag fixtures.statistics_players (season ${seasonYear}): ${findings.coverageStatsPlayers ? 'YES' : 'no'}`);
  console.log(`Coverage flag fixtures.events (season ${seasonYear}):             ${findings.coverageEvents ? 'YES' : 'no'}`);
  console.log(`Per-fixture player stats populated (real minutes):        ${findings.playerStatsPopulated ? 'YES' : 'no'}`);
  console.log(`Per-fixture events populated:                             ${findings.eventsPopulated ? 'YES' : 'no'}`);
  if (findings.problems.length) {
    console.log('\nProblems observed:');
    for (const p of findings.problems) console.log(`  - ${p}`);
  }
  console.log(`\n>>> VERDICT: ${verdict}`);
  console.log(
    {
      PLAYER_STATS_OK: '    Full FPL-style scoring is viable (per-fixture player stats available).',
      EVENTS_ONLY: '    Score from events only: goals / assists / cards / substitutions.',
      INSUFFICIENT: '    Coverage too thin — re-evaluate provider (BeSoccer / Sportmonks).',
    }[verdict],
  );
  console.log(`\nTotal API requests consumed by this run: ${requestCount}`);
}

main().catch((err) => {
  console.error(`\nUnexpected error (caught, not thrown): ${err?.stack ?? err}`);
  process.exitCode = 1;
});
