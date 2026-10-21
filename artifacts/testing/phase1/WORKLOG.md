# Phase 1 - theme foundation and compact shell

Implementation and technical verification complete, 19 October 2026. **Awaiting
user visual review. Phase 2 has not started.**

## Delivered scope

- Removed the large editorial heading/illustration. The existing Linea brand,
  working help/settings/import actions and game metadata form a compact shell.
- Applied the specified dark/yellow palette to board surroundings, moves, engine,
  report, imports, settings, promotion, help, loading, empty and error states.
- Replaced the old stacked color overrides with one semantic token block in the
  main stylesheet. Report CSS consumes the same tokens; accessibility CSS now
  owns focus/hidden-text/reduced-motion behavior rather than recoloring the UI.
- DM Sans/system sans, 14 px body, 12 px metadata, 16-18 px headings, tabular
  numbers, monospace notation, 8 px controls and 12 px panels. No tiny-text
  responsive overrides or application-wide scaling.
- Added Neutral as the new-user board palette, using the specified warm squares
  and last-move colors. Sage/Walnut/Slate remain available. Board palettes never
  change the dark/yellow application theme.
- Migrated saved v1 display preferences to board-only v2 settings without deleting
  v1 or touching game/other-app data. Existing palette, piece, sound, coordinate,
  animation and move-badge preferences remain intact. Storage failures preserve
  valid in-memory settings.
- Kept original SVG piece assets and annotation colors. Semantic review colors
  remain green/yellow/orange/red/cyan with symbols and labels. Selected yellow
  moves use dark notation and dark-backed colored classification chips.

The existing moves/report panel and engine placement remain. The board-first
switching pattern extends through tablet width rather than squeezing readable
controls into a narrow two-column layout. The left rail, shared import ownership,
separate report composition and drawers belong to Phase 2, not this delivery.

## Recovery and source boundaries

- [Pre-Phase 1 checkpoint](checkpoint-before-phase1.tar.gz) and
  [manifest](checkpoint-manifest.json): 82 files, all archive members read back
  and SHA-256 verified. Archive checksum:
  `a4e20235715cd7c16197a9d219364f97c119fdfb8bf70380f47c584ea139d632`.
- [Verified Phase 1 handoff](checkpoint-verified-phase1.tar.gz) and
  [handoff manifest](verified-checkpoint-manifest.json) preserve the tested source,
  build, phase-specific evidence and documentation. Restore into a new directory,
  inspect the extracted project and use its lockfile with `npm ci`; never overwrite
  newer work blindly. There is no Git commit/repository for this app.
- [Source diff](source-changes.patch) records the source-level changes. The engine,
  both engine hooks, review/scoring module, provider implementation, resolver,
  piece/engine assets and dependency/configuration files were hash checked against
  the checkpoint: **29 protected files unchanged**. All chess functions after the
  presentation-only FEEDBACK table are byte-for-byte unchanged.
- No new provider, engine policy, score formula, opening lookup, history scanner,
  thread selector, threat toggle, deployment, GitHub publication or other app edit.

## Verification

The complete `npm run test:baseline` gate ran sequentially with one worker and
zero retries. [Full log](final-baseline.log) and [summary](summary.json).

| Gate | Result | Frozen phase evidence |
| --- | --- | --- |
| ESLint and fresh production build | Passed | [Gate log](final-baseline.log) |
| Unit tests | 133 passed | [Unit report](final-unit-results.json) |
| Browser/UI/provider fixtures + six Phase 1 workflows | 48 passed | [Browser report](final-browser-results.json) |
| Real native Stockfish / recovery / review | 13 passed | [Engine report](final-engine-browser-results.json) |
| Firefox/WebKit | 6 passed | [Cross-browser report](final-crossbrowser-results.json) |
| Compiled production | 3 passed | [Production report](final-production-browser-results.json) |
| Automated accessibility | 18 surfaces, 0 detected violations | [Summary and incomplete-item counts](summary.json) |

All four final browser suites share source fingerprint
`e0fc98f228cccb8192a2acc49dbf12b43628168af283984eb1f680c8ea66f022`.
They record unchanged pre/post source, zero failures/skips/flakes, no unexpected
remote requests, no report-level errors and no detected host execution gaps.

### Phase-specific evidence

- [1440 x 900 layout](desktop-layout.json): header 64 px; board 540 x 540 px;
  evaluation strip 24 x 540 px; essential transport ends at y=874, inside the
  viewport. The entire lower engine/report content may still need vertical
  scrolling until Phase 2 repositions it.
- [Responsive measurements](responsive-layouts.json): no horizontal overflow at
  360, 390, 768, 1024, 1440, 1600 and 1920 px; also 844 x 390 landscape and
  1440 x 650 short-height checks. Board/evaluation heights match. At 390 px,
  header, annotation and transport buttons meet 44 x 44 px targets.
- [Preferences/state retention](preference-state-retention.json): palette changes
  preserve the active variation, selected ply, manual mark and original PGN.
  **One existing native worker and two existing searches remained unchanged**;
  opening/changing/closing settings did not start another worker/search.
- [Selected-move contrast](selected-move-contrast.json): dark notation on yellow
  **11.87:1**; minimum category badge/icon text contrast **7.87:1** across all
  seven classifications. The style fixture mounts the real badge component but
  uses explicitly labeled synthetic categories, not fake engine evaluations.
  Real reviewed-move/report accessibility checks also pass independently.
- [Native 200% browser zoom](native-browser-zoom.json): native `tabs.setZoom(2)`,
  720 CSS px in a 1440 px window, DPR 2, CSS zoom 1 and visual/pinch scale 1.
  Navigation works; settings fit with internal scrolling and retain keyboard
  focus. [Reproducible supplemental script](native-zoom-check.mjs) uses a disposable
  test-profile-only extension, never the user's browser profile. Settled CDP
  device-pixel captures avoid the browser automation clip issue at native zoom.
- [Real font and engine-state checks](font-and-engine-states.json): DM Sans
  stylesheet/font requests returned HTTP 200; desktop/mobile layouts have no
  overflow with the real font. Deliberately held/aborted engine script transport
  produces honest loading/error screenshots; release/retry uses real WASM results.
  The expected aborted engine request is recorded, not treated as a font failure.

### Issues diagnosed during implementation

- A presentation-fixture test initially imported a named `createRoot` from Vite's
  CommonJS prebundle, which exposes it through the default export. Corrected the
  test import; no app workaround or skipped category was introduced.
- An initial native-zoom preference probe was ignored by Chromium. The first
  extension probe was disabled by browser launch defaults. Native zoom was then
  verified with explicitly enabled extensions in a disposable profile and the
  actual zoom API. The failed probes remain historical artifacts, not app failures.
- Native browser zoom exposed a screenshot clipping issue, and an immediate raw
  capture caught the dialog fade. The final captures use unclipped device pixels
  and settled reduced motion. The app's zoom/focus geometry checks passed.

## Visual checkpoint

Visually inspected: actual-font desktop/mobile, selected category fixtures, real
reviewed move/report, populated imports, settings, promotion, loading/error states,
and the native-zoom dialog. Main previews:

- [Desktop, real DM Sans](../../screenshots/phase1/desktop-dm-sans.png)
- [Mobile, real DM Sans](../../screenshots/phase1/mobile-dm-sans.png)
- [Selected classification style fixture](../../screenshots/phase1/classification-style-fixture.png)
- [Populated import](../../screenshots/phase1/archive-results.png)
- [Settings](../../screenshots/phase1/settings-dialog.png)
- [Engine error](../../screenshots/phase1/engine-error.png)
- [Native 200% dialog](../../screenshots/phase1/native-200-percent-dialog.png)

## Acceptance and limits

- **L02: technically verified. User visual approval is pending.**
- L01: compact shell addressed; complete workspace organization remains Phase 2.
- L03-L05: open for Phase 2; F01-F04 open for their later phases.
- F05/F06/E01: deferred exactly as planned; no misleading controls were exposed.
- Default suites isolate remote fonts/providers. Real font delivery was checked
  separately. Live Chess.com account/API tests were not rerun in Phase 1; the
  earlier Phase 0 live result is historical, not relabeled as a current pass.
- Touch is browser-emulated; installed Safari, physical phones and assistive
  technologies still need human checks. Zero axe findings is not certification.
- A blocked WASM download retains the existing 35-second startup timeout before
  Retry; this behavior was reverified, not changed by the theme.
- No dependency upgrade or fresh vulnerability audit was performed.

**Stop for user review. Do not automatically proceed into Phase 2.**
