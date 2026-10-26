# Linea verification

## GitHub / Vercel release — 26 October 2026

**[Live Linea](https://linea-chess-analyzer.vercel.app)** is deployed from the
existing private repository's `redesign` branch. Baseline `main` is untouched.
Local lint/data/build, **417 units**, **19 targeted production Chromium workflows**,
and Vercel's Git-triggered Linux clean install/full unit/build gate passed.
**12 real hosted checks plus one native offline workflow** passed: exact asset/
engine hashes, MIME/headers, public PGN import, real Stockfish review/branch feedback,
original return, saved-review reload, video playback, emulated-phone tap/layout,
restricted API denials and offline evidence preservation. Desktop/mobile captures
were inspected. No engine results, saved evidence or provider responses were mocked.

See [deployment evidence, intermediate QA corrections and safe-update instructions](DEPLOYMENT.md).
This is not every historical suite, real-user provider import, physical-device,
other-browser or human-accessibility verification. No other application changed.

## Explanation relevance and supporting visuals - 25 October 2026

Lint/build, **411 unit tests and 19 production Chromium workflows pass**. Eighteen
new relevance/visual units and two native browser workflows verify that factual
benefits are not quality proofs, later/equal exchanges do not explain inaccuracies,
same-root immediate consequences support comparisons, and played/alternative/reply
arrows have the correct legal roots. Existing state/search/branch regressions pass.
Four explanation/comparison axe surfaces report zero detected A/AA violations.

Final source guard is unchanged with no execution gaps, failures, retries or skips:
`eaea5aca2e4428285835a54563163c22aa5a8f7cd5bab808949b769726d033b4`.
Scoring/engine/review policy sources match the starting checkout byte-for-byte.
No additional rewrite/playback searches, API, language AI or deployment. See the
[report and examples](artifacts/testing/explanation-relevance/REPORT.md). Other
browsers, physical devices and human usefulness/accessibility remain unverified.

## Local rule-based move explanations - 24 October 2026 UTC

**393 unit tests and 17/17 production Chromium workflows pass**, including eight
new native-engine explanation/illustration workflows and nine existing branch
regressions. Lint, dataset validation and build pass. Three explanation-specific
axe scans report zero detected WCAG A/AA violations; screenshots were inspected.
Source identity stayed unchanged during the final production run:
`c36d7b52be20e984f1efc03de9cd3d03d8e3a0dfe8e7613cac0648b5d10778b2`.
No final failures/skips/flakes/retries or host execution gaps.

The tests verify accepted-root/generation handling, legal reply/recapture support,
automatic concrete reasons, Show why without new searches, exact return, original
PGN/accuracy/classification/evidence/annotation preservation, branch transition,
reload, mobile controls and an uninterrupted running foreground review. Core
scoring/review-policy/engine sources are byte-identical to the task baseline.
The [report](artifacts/testing/move-explanations/REPORT.md) documents supported
facts, limits, runtime cost, examples and intermediate failures. No language AI,
API, dependency upgrade or deployment. Safari/Firefox, physical devices and human
accessibility remain manual; this is not every historical release suite rerun.

## Live branch move review - 24 October 2026

Automatic alternate-move classification, board/phone feedback, cancellation-safe
branch evidence and original-review pause/return/resume are implemented.
Original PGN, accuracy and completed evidence are kept separate. Lint, opening
data validation, build and **352 unit tests** passed. **9/9 production Chromium
branch workflows** passed with unchanged source identity and no execution gaps,
failures, retries, skips or flakes. Three scoped axe scans report zero violations.

See the [branch-review report](artifacts/testing/branch-review/REPORT.md) for the
native engine/IndexedDB evidence, screenshots, intermediate failures and concurrent
edit handling. This is a targeted gate, not a rerun of every historical suite;
Safari/Firefox, physical devices and human accessibility review remain manual.
No deployment or changes to other applications were performed for this task.

## Earlier status — product evolution foundation verified

**20 October 2026.** Phases 0/1 of the new redesign plan are complete: baseline
checkpoint, native IndexedDB library/checkpoints/drafts, route restoration,
exclusive shared engine ownership, safe deletion/retry and production offline
saved-review recovery. The two-column redesign, 10/30 browser, batch reports and
Staunton/wood 3D homepage remain pending. No deployment or unrelated app edits.

Final gate: lint/data/build, **281 units and 115 browser/engine workflows passed**:
75 Chromium + 18 engine + six Firefox/WebKit + three production + 12 new product
state workflows + one full production offline workflow. Zero final failed/skipped/
flaky/retried tests. Source identity
`be0674a9117235acff576c9fe993ea06a1a87d552f7b29058afcc1c7f0805525`
is unchanged across all six final browser suites; no recorded host execution gaps.

[Delivery details and limitations](artifacts/testing/product-evolution/WORKLOG.md),
[frozen results](artifacts/testing/product-evolution/phase1/summary.json),
[desktop library](artifacts/testing/product-evolution/phase1/library-1440.png),
[phone library](artifacts/testing/product-evolution/phase1/library-390.png), and
[offline production review](artifacts/testing/product-evolution/phase1/offline-review.png).

New storage/offline/cross-tab tests ran in Chromium. The existing Firefox/WebKit
core suites pass; their complete new storage/offline matrices, installed browsers,
real devices and human screen-reader checks remain release checks. No new live
provider requests or vulnerability audit were run. The existing lazy opening-chunk
advisory remains. Browsers missing Web Locks get an explicit engine-unavailable
state; saved evidence and board remain usable. Review computation does not run
after tab closure. Previous frozen release records below are retained as history.

## Earlier — Accuracy v2 verified

**20 October 2026 UTC.** Accuracy/evidence/report increment only. Stockfish 19.0.1
assets, provider adapters, framework and dependencies are unchanged. No deployment,
GitHub publication, batch jobs, persistence or unrelated application edits.

- Lint, pinned opening-data validation, build and **269 unit tests passed**.
- **75 Chromium, 18 native-engine, six Firefox/WebKit and three production
  workflows passed**: 102 total, zero final failures/skips/flaky/retries.
- The native benchmark contains **14 fixtures / 20 completed review runs**, including
  actual best-versus-played restricted-root searches, both mate winners, Black-start
  FEN, underpromotion, castling/en-passant, repetition, forced moves, missed mate,
  stalemate, long losing play, verified sacrifice and a historical reference prefix.
- New exported-review/experimental-rating surfaces pass desktop/mobile axe checks;
  all eleven selected/nonselected classification styles pass contrast checks.
- All final browser suites share unchanged source SHA-256
  `6bec194f2ddf8e54b2c41d74020e981d3c9ec886c530cdf028e2f7d7f5b6cf53`.
  Served engine hashes match the pinned release; no host execution gaps.

[Model/limits](ACCURACY_MODEL.md), [worklog](artifacts/testing/accuracy-v2/WORKLOG.md),
[frozen summary](artifacts/testing/accuracy-v2/summary.json),
[native evidence](artifacts/testing/accuracy-v2/native-benchmark.json), and
[same-evidence comparison](artifacts/testing/accuracy-v2/model-comparison.json).

Not claimed: every possible position, statistical validation against a held-out
rated-game corpus, calibrated game Elo, tablebase truth, or Chess.com percentage
parity. Reference-formula tests use pinned-source transliteration/explicit numeric
fixtures, not an executed Scala runtime. The historical prefix was already an
existing regression, not an independent held-out corpus. Optional live-provider,
native 200% zoom, physical-device and human screen-reader checks were not rerun.
The pre-existing lazy opening-chunk size advisory remains disclosed.

The records below describe the **earlier Phase 4 release**. Its old scoring/rules
preservation statements are historical and superseded by Accuracy v2.

## Historical status - Phase 4 complete

**Verified 20 October 2026 UTC. Phase 5 is explicitly deferred and was not added.**

Preview: **[Linea on localhost](http://127.0.0.1:4325)**.

Phase 4 adds independent game-review quality, generation-safe execution and
provenance, and a complete category-by-player breakdown. Existing Phase 2/3
workspace, imports/openings, Stockfish 19 and numerical scoring rules are retained.
No deployment, GitHub publication, cloud persistence or other application change.

## Delivered Phase 4 behavior

### F03 - quality, generation safety and truthful evidence

| Game review quality | Target depth | Position time limit | Acceptance-check limit |
| --- | --- | --- | --- |
| Quick | 12 | 450 ms | 600 ms |
| Balanced (existing default) | 16 | 1,100 ms | 1,400 ms |
| Deeper | 20 | 3,000 ms | 4,000 ms |

- **Position depth is separate.** Its current-board worker and existing budgets
  are unchanged; changing it does not change a game review's policy or records.
- Quality selection is **pending only**. It does not start searches, cancel a
  running generation, or relabel existing scores. The UI names both pending and
  displayed policies. Explicit Review/Rerun starts the selected generation.
- Rerun replaces the review but preserves original PGN, board branch and marks.
  Pause/resume preserves completed results only in the same game/settings
  generation. Imports/reset and explicit reruns reject late search/hash/error
  callbacks from old generations or old attempts within the same generation.
- The review records game/session identity, SHA-256 content signature, engine
  version and JS/WASM hashes, policy/scoring versions, target/time budgets,
  actual completed depths, timestamps, resume count, state and coverage.
  Each move carries its own generation/policy and sacrifice evidence.
- Exact rules-derived outcomes have depth 0 and no native target/budget; they
  are excluded from search-depth ranges. Claimable draws are distinguished from
  automatic terminal results. A shallow acceptance is never verified Brilliant.
- Review evidence and pending quality are session-only; no Phase 5 history store,
  scanner, batch analysis or persistence feature was introduced.

### F04 - complete per-player classifications

Every existing category is shown by White and Black with separate reviewed,
unreviewed and total rows. The selector iterates recorded plies once using the
actual mover color, including Black-start FEN games and unequal side totals.
Unreviewed moves are not assigned a score. Existing per-side/combined accuracy,
graph navigation, critical moments, coaching and methodology remain intact.

## Final verification results

Checks ran sequentially, with one worker per browser suite and **zero retries**.
The combined command completed lint/data/unit/build/browser/native checks; its
360-second tool-call limit interrupted cross-browser execution. Complete remaining
suites were then run separately against the **same source**, not counted from an
old report. Final evidence spans **2026-10-20 04:52-05:08 UTC**.

| Gate | Result | Frozen report |
| --- | --- | --- |
| ESLint, pinned dataset validation, fresh build | Passed | [Gate log](artifacts/testing/phase4/final-baseline.log) |
| Unit tests | **220 passed** | [Unit report](artifacts/testing/phase4/final-unit-results.json) |
| Chromium UI/import/opening/workspace/review | **75 passed** | [Browser report](artifacts/testing/phase4/final-browser-results.json) |
| Native Stockfish/review/recovery | **16 passed** | [Engine report](artifacts/testing/phase4/final-engine-browser-results.json) |
| Firefox/WebKit | **6 passed** | [Cross-browser report](artifacts/testing/phase4/final-crossbrowser-results.json) |
| Compiled production | **3 passed** | [Production report](artifacts/testing/phase4/final-production-browser-results.json) |
| Live Lichess | **2 passed** | [Live report](artifacts/testing/phase4/final-lichess-live-results.json) |
| Live Chess.com | **2 passed** | [Live report](artifacts/testing/phase4/final-live-browser-results.json) |
| Automated WCAG A/AA | **26 saved surfaces, 0 detected violations**, plus passing Lichess picker scan | [Summary](artifacts/testing/phase4/summary.json) |

**100 default browser/engine workflows plus four live workflows passed.** No
failed/skipped/flaky tests, report-level errors, unexpected remote requests or
host execution gaps in the final reports. Expected injected failure/cancellation
paths remain recorded; they are not silently filtered out.

All final suites share unchanged pre/post source fingerprint:
`d6f39d172a1a43e70ef69719e17ddd657be54bcb4481f0fbef26dcfe05374141`.
Runtime: Node 24.13.0, Darwin 27.2.0 arm64; Chromium 156.0.8078.4, Firefox 157.0,
WebKit 27.2. No dependency upgrade. QA retains strict owned ports 4336/4337 and
served-engine hash checks; user preview remains 4325.

## Phase-specific proof

- [Deterministic controller tests](tests/unit/review-session.test.js): 25 cases
  covering stale success/error/hash callbacks, rapid duplicate starts,
  pause/resume, mismatched policies, new games/same-id changed content, same-policy
  reruns, missing/shallow depth, rule outcomes, protected source and per-color totals.
  Mocked transport here is not claimed as native evaluation evidence.
- [Native policy evidence](artifacts/testing/phase4/native-policy-evidence.json):
  actual before/after/acceptance depths **12/12/12, 16/16/16, 20/20/20** for the
  three policies on the established constructed drawing-sacrifice fixture.
  UCI commands match 450/600, 1100/1400 and 3000/4000 ms limits respectively.
  Actual depth can be lower on other positions/hardware.
- [Pending and position-depth separation](artifacts/testing/phase4/pending-and-position-separation.json):
  pending quality causes no job or metadata mutation; changing enabled position
  depth changes only its worker; explicit rerun creates a new review generation.
- [Native pause/rerun](artifacts/testing/phase4/native-pause-rerun.json): completed
  evidence survives resume; replacing an active review terminates old work and
  does not accept stale callbacks.
- [Per-color totals](artifacts/testing/phase4/category-totals.json) and
  [Black-start/exact mate](artifacts/testing/phase4/black-start-totals.json):
  category sums equal actual reviewed plies and unreviewed counts stay separate.
- [Compiled/native-zoom checks](artifacts/testing/phase4/supplemental-report-checks.json):
  production Quick -> pending Deeper -> explicit rerun works; review controls,
  counts and completion remain usable at native 200% zoom. CSS zoom/pinch scale
  remain 1. The [supplemental script](artifacts/testing/phase4/supplemental-report-check.mjs)
  uses a disposable test profile, never the user's browser settings.

## Visual inspection and corrective work

Inspected settings, pending-state messaging, generation evidence, desktop and
four-column report counts, mobile counts and native-zoom controls:

- [Pending settings](artifacts/screenshots/phase4/quality-pending.png)
- [Review provenance](artifacts/screenshots/phase4/provenance.png)
- [Per-player breakdown](artifacts/screenshots/phase4/mobile-breakdown.png)
- [Desktop report](artifacts/screenshots/phase4/report-1440.png)
- [Four-column report](artifacts/screenshots/phase4/report-1600.png)
- [Native 200% report](artifacts/screenshots/phase4/native-200-percent-report.png)

Expanded evidence exposed a report/rail overflow issue from positioned accessibility
labels. Both scroll containers now establish their own containing block. A dedicated
regression verifies expanded content stays within the report scrollport rather
than creating blank document-height overflow. No global page clipping workaround.

## Preserved behavior and scope

Thirty-nine engine/provider/chess/board/dataset/dependency files were checksum
compared with the pre-Phase 4 checkpoint and are unchanged. The position-engine
hook, numerical accuracy functions, static-exchange/candidate checks, Brilliant
threshold expression, explanations/coaching logic and chess classification core
were compared against the checkpoint. Only rule-outcome explanatory wording is
clarified; no numerical scoring formula was changed.

Stockfish remains the exact 19.0.1 lite-single release. Previous legal/special
move, annotation, original-PGN, clocks/material, navigation, focus/reduced-motion,
import/cancellation, opening/transposition, live-provider and independent sacrifice
regressions passed again. No Thread selector or new engine/isolation configuration.

The earlier phase gates remain available:
- [Phase 2 workspace](artifacts/testing/phase2/WORKLOG.md)
- [Phase 3A Lichess](artifacts/testing/phase3a/WORKLOG.md)
- [Phase 3B openings](artifacts/testing/phase3b/WORKLOG.md)

## Reproduce, recover and remaining limits

Run `npm run test:baseline` from the app folder, followed by the separately opted-in
`npm run test:lichess-live` and `npm run test:live` when external checks are intended.
If an orchestration tool has a short call limit, run the constituent commands
sequentially rather than in parallel. Keep the host awake. No blanket timeout
increase or browser retries were introduced.

[Phase 4 worklog](artifacts/testing/phase4/WORKLOG.md),
[pre-change archive](artifacts/testing/phase4/checkpoint-before-phase4.tar.gz), and
[verified handoff archive](artifacts/testing/phase4/checkpoint-verified-phase4.tar.gz)
with [manifest](artifacts/testing/phase4/verified-checkpoint-manifest.json) preserve
source and evidence. Extract into a new directory and inspect before replacing
newer work; no Git commit was invented.

- Physical devices, installed Safari and human assistive technology remain manual.
  Zero axe violations is not complete accessibility certification.
- External provider availability is a point-in-time observation, not a guarantee.
- The existing already-lazy opening-data chunk still produces Vite's size advisory
  (677.92 kB minified / 108.59 kB gzip); the build passes and the advisory is disclosed.
- Failed WASM startup retains the existing 35-second timeout before Retry.
- Original PGN uses its existing outer-whitespace trim. Review data does not edit
  original PGN or persist across reloads.
- No new vulnerability audit, dependency upgrade, GitHub push, deployment or other
  workspace application change.

## Acceptance tracking

| Requirement | Status |
| --- | --- |
| L01-L05: workspace/theme/state/responsive controls | Verified on tested surfaces; retained |
| F01: Lichess import | Verified; retained live and deterministic checks |
| F02: opening/ECO | Verified; retained pinned/offline/FEN/transposition checks |
| **F03: review quality/provenance** | **Verified** |
| **F04: per-player classifications/report** | **Verified** |
| F05: opponent-threat arrows | Deferred; no misleading toggle |
| **F06 / Phase 5: history explorer** | **Explicitly deferred by user; not implemented** |
| E01: saved studies/full tree/analyzed export/batch PGN | Deferred |

**Phase 4 is complete. Stop for the P1 release review; do not start Phase 5.**

## v2 homepage (21 October 2026, `redesign` branch)

- New homepage per the v2 brief: free-during-beta hero, import strip, review/report demos, Coming soon concepts, FAQ.
- Brilliant fixture revalidated with Stockfish 19.0.1: native evidence test passes (depth 16, draw evaluations before/after/accepting capture, classifier unchanged). Evidence: `tests/fixtures/demo/review-evidence.json`.
- The existing UI test `actual game-review UI shows a native Stockfish 19 verified Brilliant` fails on a text assertion: the move list now renders `Rxc2+Brilliant` (icon, no `!!` glyph text). The classification is still Brilliant; the test predates the move-icon UI change and was not modified.
- Ten-game demo report generated once by the real batch review (Balanced): 10 selected, 7 score-ready, mean 71.6%, 4W 3D 3L, top theme Piece safety (9). Not-score-ready games are shown as n/a in the clip.
- Clips: 4 WebM (VP9) + MP4 (H.264), 1280 wide, 24 fps, 8.5-10.5 s, 69-237 KB each; JPEG posters (ffmpeg build has no WebP encoder). Total previews about 1.3 MB.
- Homepage tests: 7 of 9 pass. `review entry unmounts 3D... does not load the lazy hero module` also fails on the untouched `v1-pre-redesign` tag (pre-existing). `actual WebGL hero ... forward/reverse motion` is intermittent on v2 (1 of 2 runs passed; v1 passed 1 of 1).
- Lint, 311 unit tests and production build pass; `/demo-record` code is absent from `dist`.
- No video or engine request on first load; clips load only when scrolled into view.
