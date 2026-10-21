# Linea — Chess Game Analyzer

Local preview: **[http://127.0.0.1:4325](http://127.0.0.1:4325)**.

A new, independent React + Vite project implementing the requested chess analysis
workspace. Existing chess and other application source files are unchanged.

**Latest: Product evolution — foundation complete (20 October 2026).** Imported
games/positions, versioned reviews and legal workspace drafts now save in native
IndexedDB. **Recent local games** reopens them; compatible complete reviews restore
without computation, interrupted reviews offer Resume. Routes preserve saved game,
ply and panel, including back/forward. One shared worker and an origin-wide Web
Lock arbitrate review/live jobs; live analysis is on demand and pauses review.
Production caches a versioned app/engine for offline saved-review reload; the dev
server does not. Storage failure retains in-memory results/export; deletion stops
stale saves. Fresh gate: **281 units and 115 browser/engine workflows passed**.
See [product delivery log](artifacts/testing/product-evolution/WORKLOG.md) and
[frozen foundation evidence](artifacts/testing/product-evolution/phase1/summary.json).

The [approved redesign plan](../.designer/plans/linea-product-evolution-and-redesign-fe81ba06.md)
continues with the unified 10-game browser, two-column overview/guided review,
batch reports and lazy 3D homepage. Those later phases are **not implemented yet**.
Hero direction: **classic Staunton pieces + realistic wooden board**; exact model
and finish approval remains pending. No deployment, purchase or dependency upgrade.

**Earlier: Accuracy v2 (20 October 2026).** Versioned Lichess-derived scoring,
volatility/harmonic aggregation, history-preserving same-root rechecks, corrected
claimable/automatic draws, eleven classifications, conservative verified Brilliant
moves, downloadable raw/refined evidence, and explicitly **uncalibrated experimental
game Elo** are implemented. Lint/data/build, **269 units and 102 browser/engine
workflows** pass. See [model and limitations](ACCURACY_MODEL.md) and
[delivery evidence](artifacts/testing/accuracy-v2/WORKLOG.md). No deployment.
Its numerical model is unchanged by the subsequent local-data foundation.

## Run locally

Requires a current Node.js release (created with Node 24).

```sh
npm ci
npm run dev
```

The development server binds to 127.0.0.1 on port 4325. No account, hosted backend,
AI API key, or paid service is needed. A bounded local Vite middleware resolves
public Chess.com link metadata; it never forwards login credentials or cookies.
The local Stockfish worker and WebAssembly
binary are included in the public assets. Optional Google Fonts downloads fall
back to system fonts if unavailable.

## Implemented scope

- Legal chess moves via chess.js: click-to-move, pointer drag, destination hints,
  capture rings, check and last-move highlights, castling, en passant, and a
  queen/rook/bishop/knight promotion picker.
- First/previous/next/last navigation, a clickable highlighted move list, keyboard
  navigation, autoplay/pause, and four playback speeds.
- Alternative continuations on a separate analysis line with its own navigation
  and a visible Return to game action. Recorded moves are never mutated.
- Explicit annotation mode, right-pointer desktop annotations, tap-square
  highlights, drag arrows, a two-tap arrow tool for touch/keyboard, four colors,
  eraser, and clear-current-position annotations. Starting a board interaction
  pauses playback. Drawing mode prevents left-pointer piece moves.
- Flip button/F shortcut, correctly flipped coordinates, coordinate toggle,
  Neutral/Sage/Walnut/Slate board palettes, Classic/Figurine piece styles, optional sounds,
  animation controls, system reduced-motion support, and expanded focus view.
- Local Stockfish 19 Lite position analysis (pinned Stockfish.js 19.0.1,
  lite-single): pause/resume, live depth progress, White-
  perspective centipawn/mate scores, one to three candidate continuations,
  clickable continuation moves, target depths, and separately styled dashed
  numbered engine arrows. Manual annotations are never treated as engine ideas.
- Optional background game review with pause/resume, engine-derived move labels,
  icons and text, board badges, a navigable evaluation chart, and explanatory
  commentary. Review and deliberate live analysis share one coordinated worker;
  requesting live analysis pauses review. Legal board controls remain usable.
- Player names, ratings, colors, result and time-control metadata; mainline PGN
  `[%clk]` values displayed as recorded times, not invented live countdowns.
  Captured pieces and a separately labeled material balance are shown.
- PGN paste/file import, FEN loading, current FEN copy, original PGN copy/download,
  focus-trapped dialogs, visible focus, accessible labels, tooltips and a shortcut
  guide. Mobile Board/Moves/Insights controls switch workspace surfaces.
- Shared import drafts/results across rail, modal and breakpoints; explicit game
  selection, Cancel and New analysis prevent late requests from replacing work.
- Left engine/tools rail, dominant board, separate right moves/report, desktop
  playback transport, conditional fourth report column, tablet tabs and drawers.
- Public Lichess username/history and exact-game imports alongside Chess.com;
  bounded batches, original PGN/clocks, no account or API credential.
- Opening name/ECO from supplied headers or a pinned local CC0 dataset. Opening
  classification belongs to the recorded game, not exploratory branches or FEN placement.

## Data and interpretation

### Public imports, openings, accuracy and coaching

The shared picker supports **Chess.com, Lichess and PGN**; **FEN position** is a
separate action. Changing tabs, closing the dialog or resizing retains drafts,
filters, results and current requests. Use **Cancel** to stop a request. Searches
never auto-import a result: explicitly choose its row to replace the analysis and
start local review. Already-loaded rows are disabled. **Go to start** preserves
work; **New analysis** confirms discarding game/branch/marks/review while retaining
import drafts. Imported games now have a browser-local recent library; there is
no cloud library. Provider draft/results persistence and the new selection browser
belong to the next product phase.

Lichess imports use the official public single-game JSON and bounded user-history
NDJSON exports: at most **20 games per request**, with explicit Load older games.
Only completed standard games with recorded moves are loaded. Unsupported,
ongoing and zero-move entries are explained/omitted; a bad/truncated batch never
silently replaces the current game. Rate limits produce a cooldown, not automatic
retries. Both providers share the same picker and analysis lifecycle.

Opening/ECO display prefers valid **Opening, Variation and ECO PGN headers** and
labels them supplied. Otherwise, normal-start recorded games use the deepest
position match in **3,865 pinned CC0 opening records**, including transpositions.
The index is a separate local bundle; no remote opening service is queried.
Arbitrary FEN games are not guessed from piece placement. See the
[dataset notice](vendor/chess-openings/NOTICE.md) for revision and tie-breaking.

#### Chess.com specifics

Open **Import game → Chess.com**. Enter a username to browse completed public
standard games by month and time format, or paste a live/daily game URL. Loading
a Chess.com game automatically starts its local review. Cancellation, request
timeouts, rate-limit errors and unavailable-game states are handled explicitly.

Games are fetched sequentially from the official Published Data API:

- `/pub/player/{username}/games/archives`
- `/pub/player/{username}/games/{YYYY}/{MM}`

The API has no documented single-game-ID lookup. Link import tries the public
game page for player metadata, then matches the exact game ID and live/daily
type in official archives. **Some game links require either player's username**
because the public page does not expose metadata or is blocked. Link search
checks up to 18 available archive months by default; specify a month for older
games. No private callback endpoints, authentication or challenge bypasses are
used. Ongoing/private/variant games are not imported. The public API can lag.
Username requests go directly to Chess.com; the local server only requests public
link metadata. There is no database, account sync, or game-data upload.

Accuracy v2 is an independent estimate, **not Chess.com's score**. It uses pinned
Lichess-derived win conversion (multiplier -0.00368208, cp clamp +/-1000), the
reference exponential move formula with its +1 bonus, and the mean of volatility-
weighted and harmonic aggregation. Actual initial evaluations and mover colors
are retained. Missing evidence is not equal/perfect play. Partial/provisional
coverage is explicit; labels never overwrite numerical accuracy. See the complete
[method, reference differences and license](ACCURACY_MODEL.md).

Disputed moves get equal-limit, single-PV best/played searches from the same
historical root, with optional separate candidate-gap evidence. Unresolved
disagreement stays provisional. The report exports raw/refined evidence as JSON.
Experimental game Elo is an explicit user-requested **uncalibrated heuristic**,
not an account rating or reliable strength inference. It is unavailable without a
complete non-provisional finished game and >=10 non-book/non-forced decisions for
the player. Its formula and inputs are documented; it does not affect accuracy.

Brilliant detection is a conservative independent sacrifice heuristic: an
engine-preferred non-pawn move must have no more than 1.5 percentage points of
chance loss, bounded legal static-exchange analysis must estimate at least 1.5
material points at risk (or give a minor/major piece for pawns at a net cost of at
least 1 point, added after Chess.com game 185626013138 marked 9...Bxa3 Brilliant), and the resulting position must be viable. The reviewer
then separately evaluates a legal accepting capture. Mainline before/after and
acceptance searches must reach depth 12 (or the acceptance must be an exact
terminal outcome). The move is marked Brilliant only if compensation survives
those checks. Equal trades, merely hanging pieces and unverified shallow searches
are not automatically Brilliant. Other kinds of brilliant ideas can be missed;
these labels will not reproduce Chess.com's proprietary classifications.

Insights includes a player-selectable, **rule-based local coach**: strengths,
recurring loss themes, phase-based focus, tailored drills, critical positions,
move-specific engine explanations and explore-the-alternative actions. It uses
only the selected player's actually reviewed moves; it is not a remote AI chat
or Chess.com coaching. Brilliant moments also appear in the move list and board.

The public-link helper is mounted by Vite's development server, not by a static
production export. A future deployment would need an equivalent restricted
server route for automatic URL-only metadata resolution; username-based archive
requests remain browser-side.

Official API reference: https://www.chess.com/announcements/view/published-data-api

### Existing analysis behavior

The bundled Ruy Lopez study is illustrative, with fictional player names,
ratings and clock entries; the interface labels it as a sample. Engine scores
and review classifications are computed locally, not prefilled example scores.
**Game review quality** is separate from **Position depth**. Balanced remains
the default (target 16, 1,100 ms per position, 1,400 ms per qualifying acceptance).
Quick uses target 12 / 450 / 600 ms; Deeper uses target 20 / 3,000 / 4,000 ms.
Actual depth can be lower than target. Position searches retain their existing
independent depth 12/16/20 controls and time budgets.

Changing review quality only sets a pending selection. Existing records keep
their original policy; **Rerun game review** deliberately replaces the review
generation, without changing PGN, board branch or marks. Pause/resume retains
partial results only for the same game/settings generation. A game replacement
or rerun rejects old search/signature/error callbacks.

The report shows generation/game IDs, a SHA-256 content signature, engine/build
hashes, policy/scoring versions, actual completed depths, timestamps and coverage.
Per-move evidence includes before/after/acceptance details. Rules-derived outcomes
have no native search depth, and claimable draws are distinguished from automatic
terminal outcomes. Per-player classification totals use actual move colors,
including Black-start FEN games; unreviewed plies remain separate. Accuracy v2
supersedes the former formula. Threefold/fifty-move availability is not an exact
terminal draw; fivefold/75-move outcomes are automatic, with checkmate precedence.
Scores and classifications can change with deeper searches.

PGN export preserves the imported text, including original comments and RAVs.
Temporary exploration lines and manual marks are **not** written into that PGN;
copy the current FEN to keep an explored position. Imports, analysis lines,
reviews and legal workspace drafts/marks are saved in IndexedDB for imported games.
Only small display preferences use localStorage. The bundled sample is not
automatically saved. Browser settings may erase local data; keep exports. No game
is uploaded. A browser without Web Locks can still use the legal board and saved
evidence, but engine work is refused explicitly rather than run without safe ownership.

## Delivery / verification boundary

The current product-foundation gate passes **281 units, 75 Chromium, 18 native
engine, six Firefox/WebKit, three production, 12 product-state and one production
offline workflow**. The default baseline remains available; additionally run:

```sh
npx playwright test --config playwright.product.config.js
npx playwright test --config playwright.product-production.config.js
```

Run a production build before the offline suite. These use the existing strict
owned test ports sequentially. New IndexedDB/offline/cross-tab surfaces were tested
in Chromium; Firefox/WebKit core regression checks also passed. Real-device,
installed-browser storage/update behavior and human accessibility remain manual.

The **Accuracy v2** gate passed lint, dataset validation, build, **269 units,
75 Chromium workflows, 18 native-engine workflows, six Firefox/WebKit and three
production checks**, with zero final failures/skips/retries. The native benchmark
includes 14 fixtures / 20 review runs. Optional live-provider tests and native
200% zoom were not rerun for this scoring-only update. Physical-device and human
assistive-technology checks remain manual. See [current verification](VERIFICATION.md).

The following **earlier Phase 4 delivery record** is retained as history, not the
current scoring policy. **Phase 5 is explicitly
deferred and was not added.** The previous Phase 2/3 gates remain preserved.

- Final lint, opening-data validation, build, **220 unit tests, 75 Chromium
  browser workflows, 16 native-engine workflows, six Firefox/WebKit workflows
  and three production checks passed**, without retries. Four live provider
  workflows passed again.
- All three quality policies were verified on real Stockfish searches. Tests
  prove pending-setting isolation, explicit rerun, cancellation, same-generation
  resume, actual-depth provenance, shallow-sacrifice rejection and per-side totals.
- Twenty-six saved axe surfaces have zero detected violations; the Lichess picker
  scan also passes. Compiled review controls and native 200% browser zoom were
  checked. Physical-device and human assistive-technology checks remain manual.
- Stockfish.js 19.0.1, provider logic, openings and board mechanics are unchanged.
  Balanced limits and numerical accuracy/Brilliant rules are preserved. No new
  engine assets, dependency upgrade, history scan, deployment or GitHub push.

See [current verification](VERIFICATION.md), [Phase 4 delivery/evidence](artifacts/testing/phase4/WORKLOG.md),
[Phase 2 gate](artifacts/testing/phase2/WORKLOG.md), [Lichess gate](artifacts/testing/phase3a/WORKLOG.md),
and [opening gate](artifacts/testing/phase3b/WORKLOG.md).

### Run the baseline

```sh
npm run test:baseline
```

This runs lint, pinned opening-data validation, units, build, browser regressions, native JS/WASM checks,
Firefox/WebKit checks and production checks sequentially. Playwright's browser
binaries must be available. Keep the host awake and do not run suites in parallel.
QA uses its own strict ports **4336/4337**, checks app and asset identity, detects
source changes/suspension, and never reuses the user preview or another app.

Optional public-provider smoke tests are deliberately separate:

```sh
npm run test:live
npm run test:lichess-live
```

No account login is needed. The default is the public account `erik`; override
with `LINEA_CHESSCOM_USER` only when deliberately checking another public history.
Native engine tests never fake UCI scores. Default browser checks fixture provider
responses and isolate optional font CSS; an explicit font-outage test confirms
the board and real engine remain usable. Theme contrast, native 200% zoom and
Phase 2 composition were checked; physical-device/screen-reader testing remains
manual. The separate lazy opening bundle triggers Vite's size advisory (about
678 kB minified / 109 kB gzip), not a failed build or an initial-entry dependency.

## Files

- [Application](src/App.jsx)
- [Local library](src/library.js), [persistence owner](src/useLocalLibrary.js), [recent-games dialog](src/LibraryDialog.jsx)
- [Engine coordinator](src/engineCoordinator.js), [validated checkpoint recovery](src/reviewCheckpoint.js), [route state](src/workspaceRoute.js)
- [Board interactions](src/Board.jsx)
- [Game model / import](src/chess.js)
- [UCI worker client](src/engine.js)
- [Pinned engine build](src/engineBuild.js)
- [Position and game-review hooks](src/useEngine.js)
- [Engine and shared panel controls](src/Panels.jsx)
- [Moves panel](src/MovesPanel.jsx) and [report panel](src/ReportPanel.jsx)
- [Single-owner import state](src/importState.js) and [shared picker](src/GamePicker.jsx)
- [Lichess adapter](src/lichess.js) and [import presentation](src/LichessImport.jsx)
- [Opening lookup](src/openings.js) and [pinned dataset](vendor/chess-openings/provenance.json)
- [Dialogs and accessible controls](src/UI.jsx)
- [Chess.com import UI](src/ChessComImport.jsx)
- [Published Data API client](src/chesscom.js)
- [Restricted public-link resolver](server/chesscom-resolver.js)
- [Accuracy, sacrifice evidence and coaching model](src/review.js)
- [Accuracy v2 arithmetic](src/accuracy.js), [book evidence](src/reviewBook.js), and [experimental game Elo/export](src/gameRating.js)
- [Complete scoring documentation](ACCURACY_MODEL.md)
- [Review policies and content signature](src/reviewPolicy.js)
- [Generation-safe review owner](src/reviewSession.js)
- [Quality, provenance and per-player report](src/ReviewDetails.jsx)
- [Review and coaching UI](src/ReviewInsights.jsx)
- [Styles](src/styles.css) and [review styles](src/review.css)
- [Third-party notices](THIRD_PARTY.md)
