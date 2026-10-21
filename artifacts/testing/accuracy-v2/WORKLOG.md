# Accuracy v2 delivery and evidence

User request (20 October 2026): serious independent Stockfish 19 Lite review,
scenario regressions, Brilliant moves within the game, and game-based Elo estimates.
Scope: accuracy/evidence/report only; no homepage, library, batch or deployment work.
The later explicit Elo request supersedes the earlier MVP prohibition, but cannot
establish a calibrated player-rating model. The UI says **uncalibrated experimental**.

## Completed checklist

- [x] Preserve original-source checkpoint and prior native evidence.
- [x] Pin scoring sources/licenses and numeric fixtures; define tolerances first.
- [x] Independent scoring/aggregation, actual colors, missing/stale-data safety.
- [x] Correct claimable draws; add history-preserving same-root disputed searches.
- [x] Conservative acceptance-verified Brilliant; complete eleven-category report.
- [x] Experimental rating gate, provisional states and full per-move JSON export.
- [x] Scenario units, native benchmark, full browser/engine/cross-browser/build gate.
- [x] Document formulas, license obligations, actual variability and limitations.

Acceptance thresholds established before execution: deterministic source-reference
move/formula/window outputs within 1e-9; mirror-color values within 1e-9; no scoring
missing/stale evidence; no Best/Brilliant label hiding unresolved material loss;
no exact claimable-draw shortcut; original history retained on searches/resume.
Native selected tactical fixtures require correct mate winner/known losing move.
No target-site percentage fitting or depth-based confidence percentage.

## Implementation

- [Accuracy arithmetic](../../../src/accuracy.js): pinned constants, +1 reference
  bonus, aligned dynamic windows, weighted/harmonic aggregation, explicit coverage.
- [Review owner](../../../src/reviewSession.js): equal-limit MultiPV=1 unrestricted
  and restricted root searches, optional independent gap search, actual timing and
  depths, provisional disagreement, cached rechecks and generation-safe cancellation.
- [Rules/policy](../../../src/reviewPolicy.js): v2 identifiers; no exact zero for
  threefold/fifty availability; automatic fivefold/75; checkmate precedence.
- [Classifier/legal model](../../../src/chess.js): Best cannot bypass large loss;
  Forced/Book/Great/Miss evidence; actual colors; impossible non-moving-king check
  rejected before native search. Existing chess.js legal move implementation kept.
- [Book evidence](../../../src/reviewBook.js): consecutive real position matches,
  not supplied opening labels or first-N-ply assumptions.
- [Sacrifice/coaching](../../../src/review.js): legal SEE and separate acceptance
  searches; truncated SEE cannot establish a candidate. Rating never relaxes it.
- [Rating/export](../../../src/gameRating.js): gated uncalibrated game-Elo heuristic,
  independent from scoring; exact PGN and unrounded evidence export.
- Report methodology, raw/refined move evidence, eleven category counts, global
  recheck depth ranges and accessible new semantic colors. Existing spatial layout
  remains untouched; this is not the superseding two-column MVP implementation.

Detailed formulas and boundaries: [ACCURACY_MODEL.md](../../../ACCURACY_MODEL.md).
Pinned original reference source and licenses: [notice](../../../vendor/accuracy-reference/NOTICE.md).

## Baseline and saved evidence

- [Original-source checkpoint](baseline/source-before.tar.gz): existing source before
  implementation, plus the new unused accuracy scaffold. No original implementation
  was overwritten before preservation.
- [Earlier native policy evidence](baseline/native-policy-evidence.json) and
  [earlier native workflow results](baseline/engine-browser-results.json).
- [Native benchmark](native-benchmark.json): **14 fixture families, 20 actual reviews**;
  native best/played restricted searches use the unmodified vendored JS/WASM.
- [Same-evidence comparison](model-comparison.json): former v1 formula, v2 on the
  exact same raw mainline evidence, then v2 with root refinements. This isolates
  formula/aggregation changes from search changes; it is not a second v1 engine run.
- [Downloaded report sample](downloaded-review.json): actual UI JSON download.
- [Summary / variability](summary.json); regenerate from the app folder with
  `node artifacts/testing/accuracy-v2/summarize.mjs`.

The historical game is the existing verified Kasparov-Topalov 1999 prefix through
23...Qd6, **not the complete game**. It was already a regression, so it is not
represented as an independent held-out corpus. Other fixtures are explicitly
synthetic. The long endgame's player ratings/result are test inputs, not real people.

## Final gate (20 October 2026)

Suites ran sequentially, one browser worker, zero retries. Final source identity:
`6bec194f2ddf8e54b2c41d74020e981d3c9ec886c530cdf028e2f7d7f5b6cf53`.
All browser suites confirm unchanged pre/post identity and no host execution gaps.

| Check | Result | Frozen evidence |
| --- | --- | --- |
| ESLint, pinned opening validation, production build | Passed | Terminal execution; unchanged final source |
| Unit tests | **269 passed** | [JSON](final-unit-results.json) |
| Chromium UI/provider/workspace | **75 passed** | [JSON](final-browser-results.json) |
| Native engine and new accuracy benchmark/UI | **18 passed** | [JSON](final-engine-browser-results.json) |
| Firefox/WebKit | **6 passed** | [JSON](final-crossbrowser-results.json) |
| Compiled production | **3 passed** | [JSON](final-production-browser-results.json) |

**102 default browser/engine workflows passed**, no final failed/skipped/flaky tests
or report-level errors. Tests cover cancellation/pending quality/rapid navigation,
special moves, raw PGN preservation, generation isolation, provider error paths,
real Stockfish Brilliant UI and legal accepting captures, both mate winners,
Black-start FEN, repeated history, missed mate, Forced, stalemate, long losing play,
experimental Elo available/unavailable and evidence download.

Forty-five dedicated v2 unit cases plus new controller/UCI cases cover deterministic
formula/window alignment, zero/missing scores, real mover colors, mate delays,
claimable/automatic rules, boundary classification, no label-based perfect score,
recheck cancellation, ratings independent from accuracy and export inputs.
The reference check is an independently written source-transliteration/numeric
fixture comparison; **the Scala implementation was not executed**.

New desktop/mobile axe exports have zero detected violations; eleven synthetic
selected/nonselected label styles pass 4.5:1 contrast. All earlier default automated
accessibility checks pass again. This is not full accessibility certification.
[Desktop](../../screenshots/accuracy-v2/report-1440.png),
[phone](../../screenshots/accuracy-v2/report-390.png), and
[experimental rating surface](../../screenshots/accuracy-v2/experimental-rating.png)
were captured and inspected. The narrow existing report remains scrollable; a
larger two-column layout is deferred, not silently included.

## Observed variability and time cost

From the final native run on this host, **not performance guarantees**:

- Four-ply short loss: White 25.34 / 26.66 / 27.62 for Quick/Balanced/Deeper;
  roughly 0.46 / 1.92 / 6.59 seconds. The critical g4 error is caught in all three.
- Historical 46-ply prefix: White 98.30 / 94.38 / 93.76, Black 98.07 / 97.36 / 97.50;
  roughly 2.00 / 12.50 / 95.98 seconds. Twenty-five plies change labels across the
  policies (including minor Best/Excellent/Good changes); this is disclosed, not
  treated as universal classification stability.
- The constructed drawing sacrifice is verified Brilliant in all three policies.
- The synthetic long endgame yields game-Elo heuristic outputs 910 / 770 from PGN
  anchors 1500. This verifies calculation/UI plumbing, **not rating correctness**.

Full unrounded scores, per-move differences and actual search budgets/depths are
in the native/comparison JSON. Search variation remains possible even at the same
policy due to time limits and hash reuse. Deeper does not guarantee a lower score.

## Failures found and corrected (preserved, not counted as final passes)

1. The initial proposed White-mate FEN already checked the non-moving king.
   Stockfish failed that invalid position. Corrected to a legal pre-mate setup,
   added the import guard, then caught/corrected a second invalid fixture arrangement.
   [First native attempt](native-benchmark-first-attempt.json),
   [first report](first-attempt-results.json), and
   [guard-catching report](invalid-fixture-guard-results.json) are preserved.
2. The browser suite exposed three old expectations (7 categories, policy v1,
   no root searches). Updated them to assert all eleven labels and the exact
   permitted new budgets, retaining pending/cancellation/state protections.
3. The visible `Bk` abbreviation triggered label-content-name mismatch against
   accessible Book. Replaced it with a non-text glyph; the complete axe gate passes.
   [Initial browser report](browser-first-attempt-results.json) is retained.
4. Additional review exposed alternative actions still pointing to old PVs,
   omitted global root-search depths and a potentially truncated SEE estimate.
   Corrected those before the final complete gate.

## Remaining limits / deferred work

- No finite suite proves every chess position. There is no tablebase, complete
  dead-position/reachability solver or statistically representative held-out corpus.
- Brilliant is a conservative immediate-offer subset, not every creative move.
- Same-root searches reduce inconsistency but are not independent-hash minimax
  proofs. Depth/time constraints and unflagged horizon effects remain possible.
- Experimental Elo has no calibration dataset and is not reliable player-strength
  measurement; accuracy/rating must not be advertised as equivalent.
- Optional live-provider, native 200% zoom, physical device, human screen-reader
  and new vulnerability-audit checks were not rerun for this source change.
- Existing lazy opening bundle size advisory remains; build passes.
- No dependency/engine upgrade, cloud storage, background batch, deployment or
  publication. Existing review data stays session-local, with explicit JSON export.
- AGPL/GPL corresponding-source/network obligations require review before any
  future publication; licenses and source snapshots are retained locally.
