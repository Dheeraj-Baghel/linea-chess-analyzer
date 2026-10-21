# Stockfish 19 Lite upgrade - before Phase 2

Completed and verified on 19 October 2026 UTC. This is the user's explicit
engine-replacement request, not the start of Phase 2 or Phase 4.

## Selected release and provenance

- Official repository: [nmrugg/stockfish.js](https://github.com/nmrugg/stockfish.js).
- Release **19.0.1**, tag **v19.0.1**, published **2026-10-10**.
- Variant: **lite-single**, not the threaded lite build or the full network.
- Source commit: `0d5dd7944f88c817c07a26bc4fb1905d5f9c46d6`.
- [Release metadata](upstream-release.json), [annotated tag](upstream-annotated-tag.json),
  [npm metadata](npm-metadata.json) and [upstream README](upstream-README.md) were
  read directly from the official sources before integration.
- Worker: **28,230 bytes**, SHA-256
  `ccb130d7ff29408531c47d859a49f91d59d4f482d05a53eb1a3231a4f624c91a`.
- WASM: **1,845,971 bytes**, SHA-256
  `ee4f115bdb2d32cadf96cada104a05b5ec257d7ad6f57582190b49bc71f096de`.
- Both sizes and digests match the GitHub release's asset records. Files are
  unmodified and retain their upstream copyright/license/network notices.
- [Local pinned source archive](stockfish-source-0d5dd7944f88c817c07a26bc4fb1905d5f9c46d6.tar.gz)
  and [checksum manifest](source-archive-manifest.json) preserve upstream build/C++
  source. This archive's checksum is locally calculated, not advertised as an
  upstream signature. GPLv3 and corresponding-source obligations remain explicit
  in the [served engine notice](../../../public/engine/NOTICE.md).

## Integration boundaries

[Engine build metadata](../../../src/engineBuild.js) is the shared identity/path
source for the worker client, engine heading and test preflight. The production
client changes are the metadata import and new worker URL; UCI parsing,
serialization, stop, cancellation and recovery logic are unchanged.

Both position analysis and game review now use 19.0.1. Native UCI reports
**Stockfish 19 Lite WASM**, and the Threads option has **min/max 1**. It works with
`crossOriginIsolated: false`; no isolation headers, thread selector, remote engine
service, runtime CDN fetch or fallback to 18 was added. Preflight compares served
assets both to this checkout and to the pinned official release hashes.

Review budgets remain depth 16 / 1,100 ms per position and 1,400 ms per sacrifice
acceptance check. Position search settings, scoring/classification functions,
board/PGN state and the Phase 1 design are unchanged. Thirty protected source,
provider, piece, stylesheet and dependency files were checksum compared with the
pre-upgrade checkpoint and are identical.

The former 18 JS/WASM pair was moved out of public assets into rollback evidence;
it is also in the [verified pre-upgrade Phase 1 archive](../phase1/checkpoint-verified-phase1.tar.gz)
and [manifest](../phase1/verified-checkpoint-manifest.json). The fresh production
build contains only the new pair. Restore the whole checkpoint into a separate
folder for rollback, rather than mixing an old JS loader with a new WASM binary.

## Engine-dependent classification change

The first native suite correctly exposed two expectations tied to Stockfish 18:
[initial report](initial-engine-results.json) and [native evidence](initial-kasparov-sacrifice.json).
In the historical Kasparov-Topalov position, 19 Lite prefers **24.Nc6** at depth 20,
not 24.Rxd4. The unchanged Linea rule requires the played move to be engine-first
before considering Brilliant, so it returns **Excellent** for Rxd4. The full
47-ply review agrees. The old positive fixture is retained as a negative/version-
change regression; it is not forced to reproduce the previous engine's label.

To retain independent positive-path coverage, an explicitly **constructed**, not
historical, [drawing-sacrifice fixture](../../../tests/fixtures/stockfish19-drawing-sacrifice.pgn)
was validated. For 1.Rxc2+ and the accepting 1...Kxc2, the engine reaches actual
**16 / 16 / 16** depths in three real searches, with draw evaluations and four
material points at risk. The accepting position is nonterminal, so an actual
acceptance search is required. The existing classifier qualifies it as Brilliant.
The [native evidence](verified-drawing-sacrifice.json) and actual review UI both
pass without fake scores or modified thresholds. Rejected exploratory positions
remain diagnostic probes, not claimed positive fixtures.

A new UI fixture initially included an extra trailing file newline. The existing
import contract trims outer whitespace; the test now submits a canonical trimmed
fixture and checks exact preservation of that supplied string. No import behavior
was changed to satisfy the test.

This is not a claim that a newer lite network reproduces the older network's
scores or another site's proprietary labels. Accuracy and classifications can
change with engine version, position history, depth and time budget.

## Final sequential verification

[Complete log](final-baseline.log) and [machine-readable summary](summary.json).
One worker per suite; **zero retries**. Final gate: **2026-10-19 18:49-18:54 UTC**.

| Gate | Result | Frozen report |
| --- | --- | --- |
| ESLint and fresh production build | Pass | [Log](final-baseline.log) |
| Unit tests | **137 passed** | [Unit report](final-unit-results.json) |
| Chromium/UI/import fixtures/theme | **48 passed** | [Browser report](final-browser-results.json) |
| Native engine/identity/review/recovery | **16 passed** | [Engine report](final-engine-browser-results.json) |
| Firefox/WebKit | **6 passed** | [Cross-browser report](final-crossbrowser-results.json) |
| Compiled production | **3 passed** | [Production report](final-production-browser-results.json) |
| Automated WCAG A/AA | **18 surfaces, 0 detected violations** | [Summary](summary.json) |

**73 browser/engine workflows total.** All final reports have zero failures,
skips, flakes, report-level errors, unexpected remote requests and detected host
gaps. Pre/post source fingerprints match across suites:
`8106c6e19da19f1577a0663b80267a616c6c4cbe8f78f93e6227bb883710cbcf`.

[Native identity evidence](native-identity.json) observes the real app's two
workers, one for position analysis and one for review. Both report the expected
UCI name and one-thread limit and complete actual searches. WASM HTTP 200/MIME,
MultiPV, pause/resume, rapid navigation, board legality, PGN preservation, review
coverage/cancellation, JS/WASM failure/retry, mate handling and positive/negative
sacrifice behavior pass. The blocked-WASM case retains its known 35-second startup
timeout before Retry; it is not represented as instant recovery.

Current preview: **http://127.0.0.1:4325**. Current-engine screenshots:

- [Desktop](../../screenshots/stockfish19/desktop.png)
- [Running engine panel](../../screenshots/stockfish19/engine-running.png)
- [Mobile insights](../../screenshots/stockfish19/mobile-insights.png)
- [Historical Excellent result](../../screenshots/stockfish19/historical-review.png)
- [Native-verified Brilliant fixture](../../screenshots/stockfish19/brilliant-review.png)

## Handoff limits

Phase 1's theme is retained and its pre-upgrade evidence is frozen separately.
**Phase 2 has not started.** No review-provenance architecture or settings-policy
work was pulled forward from Phase 4. No deployment, GitHub push, package upgrade,
account/API credential, other application change or fresh vulnerability audit.
Live external provider tests were not rerun; deterministic import/automatic review
coverage passed. Physical devices/assistive technology remain manual checks.
