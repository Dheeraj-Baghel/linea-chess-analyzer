# Phase 0 - baseline reconciliation and recovery

Completed 19 October 2026. **Phase 0 only.** No theme/layout redesign, provider
addition, scoring change, publication or deployment was performed.

## Recoverable starting point

- [Pre-change archive](checkpoint-before-phase0.tar.gz): 258 files, including app
  source, dependency lockfile, local engine assets, previous build, screenshots,
  test reports and failure traces. Installed dependencies and this new Phase 0
  evidence directory are excluded. Every archived member was read back and its
  SHA-256 checked against the original file.
- [Checkpoint manifest](checkpoint-manifest.json): per-file hashes and archive
  checksum `6395de2ea13b15de51f7ad1732569d29cb5856caebfeb5e107e8380d2c8bfd06`.
- There is no Git repository for this application. This archive, not an invented
  commit, is the recoverable pre-change checkpoint.
- [Verified Phase 0 handoff archive](checkpoint-verified-phase0.tar.gz) and its
  [manifest](verified-checkpoint-manifest.json) separately preserve the known-good
  tested source, compiled bundle, final reports, screenshots and documentation.
  Dependencies and older failure traces are excluded from that handoff archive;
  the older traces remain in the complete pre-change archive above.
- To recover: verify the archive checksum; extract into a **new directory**, where
  it creates a `chess-game-analyzer` folder; run `npm ci` there using the restored
  lockfile. Inspect and compare before replacing any current work. Do not extract
  over this workspace or overwrite newer user work. Never restore old artifacts
  as though they were a current passing report.

## Evidence inspected

- [Prior failures](prior-failure-inventory.json): latest historical Chromium
  result was **43 passed / 11 failed**; cross-browser was **0 passed / 6 failed**.
  The older verification prose described earlier runs, not that latest baseline.
- [Trace findings](historical-trace-findings.json): request URLs, transport errors,
  console errors, failing actions and timestamps extracted from preserved traces.
- [Power-state evidence](historical-power-events.txt): macOS entered **Clamshell
  Sleep at 18:00:02 +0530 (12:30:02 UTC)**, then repeatedly slept for hundreds of
  seconds. The historical 60-second tests taking 900-1,041 seconds align with
  those sleep intervals. This is direct suspension evidence, not an assumption
  about CPU contention. Historical browser suites also overlapped, but that fact
  alone is not used to explain a specific defect.
- [Unchanged-code Chromium rerun](reproduction-results.json): four focused
  regressions passed before harness edits, including 503 recovery, MultiPV,
  rapid navigation and full review.
- [Unchanged-code cross-browser rerun](reproduction-crossbrowser-results.json):
  all three Firefox and all three WebKit checks passed before harness edits.
  Firefox is therefore **not currently launch-blocked**.

## All 17 historical failures reconciled

| Historical failure | Evidence and classification | Resolution / current evidence |
| --- | --- | --- |
| Chromium: Chess.com HTTP 503 recovery | Trace shows WASM `ERR_NETWORK_IO_SUSPENDED`, lost Vite connection, then a full page reload. The modal disappeared because the page reloaded, not because the 503 fixture imported a game. | Unchanged reproduction and final deterministic 503 check pass. QA now owns its server instead of attaching to a shared preview. |
| Chromium: MultiPV candidate variation | Clicked line 2's `15...c5`, the exact next recorded move. Snapshot has mainline ply 30 and the announcement `Recorded game: 15...c5.` App behavior is correct; rank 2 is not guaranteed to be a branch. | Select a genuinely divergent native candidate by comparing with preserved PGN. Add a separate matching-candidate mainline regression; assert exact resulting FEN and unchanged PGN in both. |
| Chromium: rapid navigation | Only recorded console error was Google Fonts `ERR_NAME_NOT_RESOLVED`; board/search assertions had completed. | Isolate optional font CSS in baseline fixtures; keep all console errors visible. Add a deliberate font-outage test proving board/native engine operation. Strengthen candidate legality/FEN assertion. |
| Chromium: full review | Only recorded console error was Google Fonts `ERR_INTERNET_DISCONNECTED`. | Same explicit optional-font isolation; real review, chart, coaching and PGN assertions pass. |
| Chromium: review pause/resume | Modal stability action timed out while the host was sleeping; wall time 328,795 ms. | Final native review pause/resume, coverage retention and game-replacement cancellation pass without an app change or extended timeout. |
| Chromium: Brilliant review UI | Page setup itself timed out over 1,041,062 ms during the recorded sleep interval. | Actual 47-ply review and Brilliant UI pass with unchanged policy/classifier. Separate native depth-20 sacrifice verification also passes. |
| Chromium: live username import | Official API and Google Fonts requests both failed with `ERR_INTERNET_DISCONNECTED`; 1,007,289 ms wall time. | Explicit opt-in live suite passes against a fresh public game, including username and exact-ID imports. Default suites never query a live account. |
| Chromium: phone tap-to-move | Navigation timed out during host sleep; 908,864 ms wall time, font request offline. | Fresh touch workflow and all mobile tabs pass. |
| Chromium: touch annotations | Tap action timed out during host sleep; 981,788 ms wall time. | Fresh touch arrows, square marks, eraser and clear workflow passes. |
| Chromium: phone review/coaching | Page setup timed out during host sleep; 917,848 ms wall time. | Fresh phone review, side selection and continuation navigation pass. |
| Chromium: desktop engine smoke | Native loading expectation ran during repeated sleep, taking 932,055 ms. | Native startup, real score/arrows and compiled-bundle checks pass. Separate JS and WASM transport failure/retry tests prove recoverability. |
| Firefox: native engine/drag/navigation | Reached app and import controls, then the action overlapped the first recorded sleep. Not a browser launch failure. | Unchanged rerun and final isolated Firefox workflow pass. |
| Firefox: review/coaching/focus | Engine-review expectation overlapped sleep; font request has `NS_ERROR_UNKNOWN_HOST`. | Unchanged rerun and final Firefox review/dialog check pass. |
| Firefox: small screen/promotion | Test timed out over 347,897 ms in the recorded sleep period; font DNS failure also captured. | Unchanged rerun and final Firefox promotion/reduced-motion/axe workflow pass. |
| WebKit: drag/Return to game | Return control was visible/enabled, then scroll/action stalled for 1,049,987 ms during sleep. | Unchanged rerun and final WebKit drag/annotation/navigation check pass. |
| WebKit: review/coaching/focus | `goto` timed out over 1,005,880 ms in the sleep period. | Unchanged rerun and final WebKit review/focus workflow pass. |
| WebKit: small screen/promotion | FEN-tab stability action took 934,031 ms in the sleep period; font request offline. | Unchanged rerun and final WebKit mobile/promotion/accessibility check pass. |

No reproducible critical application defect remains from these failures. The
resolution is test/environment isolation plus a corrected test assumption, **not
changes to legal chess, engine ownership, review settings or the scoring formula**.
37 protected source/asset/config files were hash-compared with the checkpoint and
are unchanged, including all app source, provider middleware, engine and pieces.

## Implemented QA boundaries

1. The normal browser suite excludes live provider and dedicated native-engine
   files. Unit tests with mocked worker transport remain distinct from the
   native JS/WASM suite. UI workflows that need review still use the real engine.
2. Dedicated strict-port QA servers use 127.0.0.1:4336 (development) and :4337
   (production), with `reuseExistingServer: false`. The user's preview is :4325.
   The other application also bound to :4325 was neither edited nor stopped.
3. Preflight checks Linea HTML identity and the exact served favicon, worker JS,
   WASM and production bundles against local SHA-256 hashes. Six new unit tests
   cover the wrong-app/build-mode and network-allowlist guards.
4. All browser suites use **one worker, zero retries**, a shared execution lock,
   per-test browser/network evidence and pre/post source fingerprints. A wall-time
   gap above 15 seconds invalidates the run instead of hiding suspension with
   longer timeouts. Keep the Mac awake/lid open; macOS idle-sleep prevention was
   scoped to each test command, not a persistent system-setting change.
5. Baseline browser fixtures fulfill only optional Google Fonts CSS with an empty
   stylesheet, exercising the app's documented system-font fallback. Undeclared
   remote requests and unmocked server-resolver calls fail. Explicit provider
   fixtures still exercise 404/429/503/cancel/stale-result handling. All deliberate
   transport failures remain recorded in attached diagnostics.
6. Live API checks require the separate `test:live` command (or explicit
   `LINEA_LIVE_PROVIDER=1`). The URL-only check uses only the current run's selected
   game, never an old saved success artifact. A provider outage fails this suite;
   it cannot be converted into a fixture-backed import pass.

## Final verified baseline

[Machine-readable summary](summary.json), [sequential log](final-baseline.log),
[separate live log](live-check.log), and [main verification record](../../../VERIFICATION.md).

- Lint and fresh production build passed.
- **114 unit tests**, **42 fixture-isolated browser regressions**, **13 native
  engine/smoke workflows**, **6 Firefox/WebKit workflows**, **3 compiled-production
  workflows**, and **2 explicitly run live-provider workflows** passed.
- All final browser reports have zero failures, skips, flakes, retries,
  unexpected external requests and detected host gaps. Their source fingerprint
  is identical: `db527a1929b2fcbe5653736c6ee6c3633bd68e28da89633141f43d7ea3e97e28`.
- **15 axe surfaces** report zero detected WCAG A/AA violations. Incomplete/manual
  items remain in their reports and are not presented as a full accessibility
  certification.
- Native tactical fixture: actual before/after depths 18/18; correctly remains
  Best, not Brilliant. Historical exchange-sacrifice fixture: depths 20/20/20,
  Brilliant. The actual game-review UI also independently passes.
- Fresh live public game: daily ID **1040912862**, October 2026. Username import,
  exact-ID link with username and URL-only lookup all worked; exact original PGN
  preservation was checked. This is a point-in-time observation, not an API SLA.
- Desktop, mobile, settings, populated import, error, promotion and coaching
  screenshots were visually inspected. They intentionally show the existing
  light/sage design, **not** the future dark/yellow redesign. Full-page modal
  captures include document content below the viewport; the fixed backdrop covers
  the viewport and the background is inert.
- Supplementary [loading/error/FEN-only captures](state-screenshot-checks.json)
  were verified on the user's preview and visually inspected. Retry restores
  native analysis at the retained ply; a FEN-only import has no recorded moves
  and a disabled game-review action. These are not added to suite test counts.

## Remaining boundaries

- A failed WASM fetch reaches the existing unavailable-engine state after its
  **35-second startup watchdog**; retry succeeds and board/navigation survive.
  This known recovery latency is not hidden or described as instant recovery.
- Physical phone input, installed Safari/Firefox, manual screen-reader behavior,
  all 200% zoom/short-height permutations and the future report layout are not
  certified by this run. Reduced-motion, keyboard and touch emulation checks did run.
- Remote DM Sans/Instrument Serif delivery is not a deterministic baseline
  dependency. These screenshots use system fallback fonts. Phase 1 must separately
  verify its chosen typography, theme tokens and contrast.
- No new dependency audit was run. Previous audit artifacts remain historical.
- L01-L05 and F01-F04 remain **Open** for their assigned later phases. F05/F06/E01
  remain **Deferred**. Only the Phase 0 prerequisite gate is verified.

## Completion checklist

- [x] Preserve and verify current source and QA evidence.
- [x] Diagnose all reported failures and rerun affected behavior sequentially.
- [x] Separate fixture tests, native WASM and explicitly opt-in live checks.
- [x] Correct demonstrated harness defects; add focused regression coverage.
- [x] Pass lint, units, build, browser and cross-browser gates without retries.
- [x] Record truthful source identity, limitations, recovery and localhost preview.
- [x] Stop at Phase 0 for user review; no automatic continuation into Phase 1.
