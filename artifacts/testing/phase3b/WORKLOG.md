# Phase 3B - opening name and ECO gate passed

Implemented only after Phase 2 and Phase 3A passed their independent gates, as
explicitly authorized by the user. Completed 20 October 2026 UTC. No Phase 4/5 or
publication work is included.

## Dataset and provenance

- Official [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings)
  revision `a6189a30dc273ccb21fc2536a9a2fefd5592a67a`.
- The [vendored upstream README](../../../vendor/chess-openings/README.md)
  explicitly dedicates copyright in the collection to **CC0**; the TSV schema is
  `eco`, `name`, `pgn`. No license or endpoint was inferred from a search snippet.
- All five original TSVs and their [SHA-256 provenance](../../../vendor/chess-openings/provenance.json)
  are retained. The [rebuild/check script](../../../scripts/build-openings-index.mjs)
  validates every source line with the existing chess.js dependency.
- [Dataset validation](dataset-validation.json): **3,865 legal records and 3,865
  unique terminal positions**, all available in the generated index. Index size
  677,795 bytes; SHA-256
  `a07e250fa0547c3fccc18c8bdcd4b03300dc17d646d913990c5297c460cc30f9`.

## Implemented semantics

- Valid PGN Opening/Variation/ECO headers take precedence and are labeled
  **Supplied PGN metadata**, not independently verified opening analysis.
- ECO-only metadata remains explicitly unnamed; invalid/placeholder metadata can
  fall back to local lookup. No opening name is invented merely from an ECO code.
- Normal-start recorded games use the deepest matched recorded position.
  Position keys retain board, side, castling and legal en-passant rights, ignoring
  move counters. Transpositions are supported and labeled.
- At tied positions, exact UCI sequence takes priority, then canonical line depth
  and stable ECO/name/UCI ordering. This behavior has explicit fixtures.
- The opening belongs to the recorded game, not the currently explored branch.
  The original PGN/moves/positions are never changed by lookup.
- Arbitrary FEN-only or FEN-start positions are **Opening unavailable** unless
  opening metadata was explicitly supplied; then it is labeled supplied.
- The index is a separate local lazy bundle. Board and native engine startup do
  not wait for it. Delayed results cannot overwrite a newer imported game, and
  data-load failures show unavailable without blocking navigation.

## Verification

[Final sequential log](final-baseline.log) and [summary](summary.json).

| Gate | Result | Frozen evidence |
| --- | --- | --- |
| ESLint, reproducible index check, production build | Passed | [Log](final-baseline.log) |
| Unit tests | **195 passed** | [Unit report](final-unit-results.json) |
| Chromium UI/import/theme/opening/workspace | **69 passed** | [Browser report](final-browser-results.json) |
| Native Stockfish 19 / review / recovery | **16 passed** | [Engine report](final-engine-browser-results.json) |
| Firefox/WebKit | **6 passed** | [Cross-browser report](final-crossbrowser-results.json) |
| Compiled production | **3 passed** | [Production report](final-production-browser-results.json) |
| Live Lichess | **2 passed** | [Live report](final-lichess-live-results.json) |
| Live Chess.com | **2 passed** | [Live report](final-live-browser-results.json) |

**94 default browser/engine workflows plus four live workflows, all passing with
zero retries, skips or flakes.** All six final browser suites used unchanged
source fingerprint:
`d2e80d5537ca9358bdcbf67ab42dfce92beb2cb4440bcf5fbbe467fb92135c2f`.
No report-level errors, unexpected remote requests or host execution gaps were
reported by the final gates.

There are **21 saved automated accessibility surfaces with zero detected
violations**, plus the passing Lichess picker scan. Incomplete/manual items are
not removed or presented as full accessibility certification.

The final native 200% zoom [recheck](final-native-zoom.json) passes. A separate
[compiled offline lookup check](production-offline-opening.json) confirms B20 and
C60 detection using the production lazy bundle, including network-disabled
operation after that local bundle is loaded.

## Diagnosed issues and evidence limits

- An early opening test incorrectly assumed 3...a5 was unnamed. The pinned
  dataset identifies it as Ruy Lopez: Bulgarian Variation. The test now asserts
  that deepest actual dataset match; lookup was not weakened.
- A browser screenshot run was interrupted by a recorded **902-second host
  sleep**. [Power evidence](interrupted-power-events.txt), incomplete log and
  traces are preserved. The dead runner and only its orphaned port-4336 Vite
  processes were verified before cleanup. Fresh process-scoped sleep-prevented
  gates passed; no blanket timeout increase or retry was used.
- Vite emits its normal >500 kB chunk advisory for the separate opening-data
  bundle (677.92 kB minified / 108.59 kB gzip). It is already lazy-loaded; the
  advisory is disclosed, not suppressed or described as a failed build.
- Offline here means local bundled data, not a new offline-install/PWA cache.
  Public imports still require the relevant external provider to be available.
- Stockfish files, its client/hooks, review/classification rules, chess core,
  board mechanics, original Chess.com API/resolver and dependency lockfile were
  hash-compared with the pre-Phase 2 checkpoint and are unchanged (28 files).
- Physical phones, installed Safari and human assistive-technology review remain
  manual. No live API success is guaranteed to persist through future outages.

## Recovery and completion

[Before-Phase 3B checkpoint](checkpoint-before-phase3b.tar.gz) and
[manifest](checkpoint-manifest.json) preserve the preceding verified state.
The [final combined handoff archive](checkpoint-verified-phases2-3.tar.gz) and
[manifest](verified-checkpoint-manifest.json) preserve the final source, build,
provenance and evidence. Extract into a separate directory and inspect before
replacing current work; no Git commit was invented.

**L01-L05, F01 and F02 are verified on the tested surfaces.** F03/F04 belong to
Phase 4 and are not implemented; F05/F06/E01 remain deferred. Stop after this
requested sequence. No GitHub push, deployment or other application change.
