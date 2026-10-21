# Phase 3A - Lichess import gate passed

Implemented after Phase 2 passed. User requested sequential Phase 2 -> 3A -> 3B.
No Phase 4 review-policy/provenance work or deployment is included.

## Official entry gate

Read the official Lichess API specification at pinned revision
`fedb6b86d1a6bca1e93b0f1960f2260f78b421a7`. The saved references confirm:

- `GET /game/export/{8-character-id}`, JSON with `pgnInJson`, clocks and opening;
- `GET /api/games/user/{username}`, bounded `max`, reverse date order, `until`,
  completed/ongoing flags, and NDJSON with full PGN;
- documented anonymous history streams (20 games/s) and wildcard CORS responses.

[Official single-game spec](../../references/phase3/api-game-export-gameId.yaml),
[history spec](../../references/phase3/api-api-games-user-username.yaml),
[game schema](official-schema.yaml) and [status enum](official-status.yaml).
The real export and live browser checks verified anonymous access and actual
`Access-Control-Allow-Origin: *`, rather than relying on a fixture for CORS.

## Delivered behavior

- Public completed standard games only. Strict public host/ID parsing, no private
  player links, study URLs, login, credentials, provider evaluation or remote AI.
- Twenty-game batches, explicit Load older games, inclusive timestamp overlap and
  ID deduplication. A stalled/tied cursor stops with an explicit notice.
- Bounded response bytes and PGN size; truncated JSON/NDJSON is rejected, earlier
  valid batches remain. Current game is never replaced by an arriving response.
- Shared picker retains source PGN, clocks, opening tags, ratings/colors, result,
  date and time control. Row selection explicitly loads it and starts local review.
- Separate provider drafts, explicit cancellation, stale-generation rejection,
  rate-limit cooldown without auto-retries, private/unavailable/variant errors and
  duplicate-selection protection. No state or worker rewrite.

## Real failure found and corrected

[Initial live history evidence](initial-live-history.ndjson) contained a genuine
completed resignation with no played moves. The first implementation rejected the
whole history batch. It now omits only zero-move entries with an explanatory
notice, retains valid games, and rejects direct zero-move imports without fabricating
analysis. A regression test covers this. The [initial failing report](initial-live-results.json)
is retained; the failure was not hidden by a retry or a fixture-only pass.

## Passing results

[Final sequential log](final-baseline.log): lint, **178 unit tests**, fresh build,
**64 deterministic browser workflows**, **16 native engine checks**, **6 Firefox /
WebKit workflows**, and **3 compiled-production checks** all pass, zero retries.
**89 default browser/engine workflows total.**

[Corrected live log](live-corrected.log) and [live report](final-lichess-live-results.json):
**2 real Lichess workflows pass**. Public game `q7ZvsdUF` has **125 plies and 125
recorded clocks**, with exact original PGN and 300+3 time control preserved.
The public `Lance5500` history request returned exactly the requested maximum
20 records and a selectable valid game. Both browser responses had wildcard CORS.
[Game evidence](live-game.json), [history evidence](live-history.json).

Source fingerprint: `d4e0e4898932e7a8d4987d71316ab2cef88341eb3436840596270a2557cd18ba`.
Frozen final reports/environment records and a pre-change archive/manifest are in
this folder. No hosted publication, provider credential or engine-policy change.
External availability remains a point-in-time observation, not a service guarantee.

**F01 gate passed. Continue to Phase 3B as explicitly authorized.**
