# Phase 4 - review settings, provenance and per-player report

Completed and verified 20 October 2026 UTC. **Phase 4 only. Phase 5 is explicitly
not included**, per the user's request. No history scanner, new provider, account,
persistence service, publication or deployment was added.

## Delivered behavior

### Independent, truthful game-review quality

Position depth remains the current-board setting with its existing worker and
budgets. Game review has its own session-only selection:

| Quality | Target depth | Position limit | Qualifying acceptance limit |
| --- | --- | --- | --- |
| Quick | 12 | 450 ms | 600 ms |
| Balanced (default) | 16 | 1,100 ms | 1,400 ms |
| Deeper | 20 | 3,000 ms | 4,000 ms |

Balanced preserves the previous review limits. Every label states these are
**targets/time limits**, not guaranteed achieved depths. Selecting another quality
only changes pending settings: the running review and displayed records retain
their original policy. Explicit Review/Rerun applies the selection. Rerun cancels
obsolete work, clears only the old review and creates a new generation/worker;
it does not edit the recorded PGN, board branch or manual marks.

Pause/resume preserves completed evidence only inside the same game/settings
generation. Switching the pending selection prevents resuming that generation
until the original quality is selected again, or a deliberate new review starts.
New imports/reset discard old review state. Signature, search and error callbacks
must match both the current generation and the current attempt, so a late result
from a paused/replaced run cannot corrupt a resumed or newer run.

### Versioned evidence

The [review session](../../../src/reviewSession.js) records:

- generation and game-session IDs;
- SHA-256 of the original-game payload (initial FEN, source PGN and colored UCI
  mainline), excluding the transient game-session id;
- Stockfish build/variant/version and worker/WASM SHA-256 values;
- selected policy/version, target depth and actual time limits;
- classifier and accuracy versions;
- created/updated/completed timestamps, pause/resume state and resume count;
- reviewed/total/unreviewed coverage for this generation;
- actual completed position/acceptance evaluations, reached depths and timestamps;
- per-move policy/generation identity, color/ply/SAN/UCI and sacrifice-check evidence.

Exact rules-derived outcomes have **depth 0 and no assigned search target/budget**,
and are not included in native depth ranges. Checkmate, stalemate, insufficient
material and claimable repetition/fifty-move draws are distinguished. A shallow
mainline or accepting search never becomes verified Brilliant. The classifier's
numerical thresholds and accuracy formula are unchanged; wording now distinguishes
a legal draw claim from an automatic terminal result.

The report exposes pending-versus-active settings, generation provenance and
per-move evidence. This data is session-only; no history/export/cache feature from
Phase 5/E01 was pulled into the scope.

### Per-player classification counts

A semantic table shows every existing category (Brilliant, Best, Excellent, Good,
Inaccuracy, Mistake, Blunder) by White and Black. Each recorded ply contributes
once using its actual move color, not index parity. Reviewed/unreviewed/total rows
remain separate; Black-start FEN games and unequal side totals are covered.
Existing per-side/combined accuracy, graph navigation and coaching are retained.

## Verification results

[Machine-readable summary](summary.json) records the final source and evidence.

| Gate | Result | Frozen evidence |
| --- | --- | --- |
| ESLint, pinned opening-data validation, production build | Pass | [Combined gate log](final-baseline.log) |
| Unit tests | **220 passed** | [Unit report](final-unit-results.json) |
| Chromium UI/import/opening/workspace/Phase 4 | **75 passed** | [Browser report](final-browser-results.json) |
| Native Stockfish identity/review/recovery | **16 passed** | [Engine report](final-engine-browser-results.json) |
| Firefox/WebKit | **6 passed** | [Cross-browser report](final-crossbrowser-results.json) |
| Compiled production | **3 passed** | [Production report](final-production-browser-results.json) |
| Live Lichess | **2 passed** | [Live report](final-lichess-live-results.json) |
| Live Chess.com | **2 passed** | [Live report](final-live-browser-results.json) |
| Automated WCAG A/AA | **26 saved surfaces, 0 detected violations**, plus passing Lichess picker scan | [Summary](summary.json) |

**100 default browser/engine workflows plus four live workflows passed**, with
zero retries, failures, skips or flakes in the final reports. No report-level
errors, unexpected remote requests or detected host gaps. All six suites have the
same unchanged pre/post source fingerprint:
`d6f39d172a1a43e70ef69719e17ddd657be54bcb4481f0fbef26dcfe05374141`.

- [25 deterministic controller tests](../../../tests/unit/review-session.test.js)
  exercise stale success/error/hash races, pause/resume, new game/same-id changed
  content, same/different-policy reruns, missing depth, exact outcomes and side totals.
  Their labeled fake engine is not used as evidence of native scores.
- [Native policy evidence](native-policy-evidence.json) independently uses the
  actual Stockfish 19 WASM. Before/after/acceptance searches reached **12/12/12,
  16/16/16 and 20/20/20** for Quick/Balanced/Deeper on the established constructed
  drawing-sacrifice fixture. Recorded commands match all respective policy limits.
- [Pending/position separation](pending-and-position-separation.json) proves a
  pending quality changes no review job or result; an enabled position-depth change
  changes only the position worker; explicit rerun creates a new review generation.
- [Native pause/rerun evidence](native-pause-rerun.json) proves partial resume
  retention and active-run replacement without old callbacks modifying new work.
- [Black-start totals](black-start-totals.json) and [empty/full counts](category-totals.json)
  prove exact color accounting and separate unreviewed counts.
- [Supplemental compiled/native-zoom checks](supplemental-report-checks.json)
  verify Quick -> pending Deeper -> explicit Deeper rerun in the production bundle,
  plus functioning report controls and completed review at real 200% browser zoom.
  The [script](supplemental-report-check.mjs) uses a disposable test profile only.

## Visual inspection and fixes

Settings, pending-state messages, provenance, color-count table and desktop,
four-column/mobile/native-zoom reports were inspected:

- [Quality pending without relabeling old results](../../screenshots/phase4/quality-pending.png)
- [Review provenance](../../screenshots/phase4/provenance.png)
- [Mobile breakdown](../../screenshots/phase4/mobile-breakdown.png)
- [Desktop report](../../screenshots/phase4/report-1440.png)
- [Four-column report](../../screenshots/phase4/report-1600.png)
- [Native 200% report](../../screenshots/phase4/native-200-percent-report.png)

Visual inspection found that positioned accessibility labels in long report/rail
content could create blank document-height overflow. Both scroll containers now
establish their own containing block; a regression checks that expanded evidence
stays inside the report scrollport. Initial investigation/failure evidence is
retained rather than hidden by an overflow clipping rule on the whole page.

One combined shell call hit its **360-second tool execution limit** after the full
browser and native suites had passed, interrupting cross-browser execution. This
was not an app assertion failure. Its runner was verified dead, only its orphaned
port-4336 QA server was terminated, and complete cross-browser/production/live
suites were then run separately without source changes or test retries.

## Scope, recovery and remaining limits

- [Pre-Phase 4 checkpoint](checkpoint-before-phase4.tar.gz) and
  [manifest](checkpoint-manifest.json) preserve 124 verified files.
- [Final handoff archive](checkpoint-verified-phase4.tar.gz) and
  [manifest](verified-checkpoint-manifest.json) preserve current source, build,
  tests and evidence. Restore into a separate directory and inspect before replacing
  newer work. No Git commit was invented.
- Thirty-nine engine/provider/chess/board/dataset/dependency files are unchanged.
  The position-engine hook, accuracy functions, sacrifice-candidate checks and
  Brilliant threshold expression were compared with the checkpoint and remain
  unchanged. Game-review execution moved to an explicit generation owner.
- Stockfish remains the pinned 19.0.1 lite-single pair. No Threads selector or
  isolation-header work. No dependency upgrade or new vulnerability audit.
- The existing lazy opening-data chunk size advisory and 35-second failed-WASM
  startup timeout remain documented. They are not silently suppressed.
- Live services are point-in-time observations. Physical devices, installed Safari
  and human assistive-technology review remain manual; axe is not certification.
- Original PGN uses its existing outer-whitespace trim. Review data does not alter
  source PGN and does not persist across reloads.

**F03 and F04 are verified on the tested surfaces. Phase 5 remains deferred and
was not implemented. Stop here for the P1 release review. No deployment.**
