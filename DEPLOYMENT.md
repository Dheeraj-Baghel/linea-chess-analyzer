# Linea — GitHub and Vercel hosting

The user authorized pushing this existing project to GitHub and deploying it on
Vercel on 26 October 2026. Only Linea is covered; no other project is uploaded.

## Source and branch boundaries

- Private source: https://github.com/Dheeraj-Baghel/linea-chess-analyzer
- Existing `main` and `v1-pre-redesign` baseline are preserved.
- The current working version is committed to `redesign`; that is Vercel's
  **production branch**. Future pushes to `redesign` trigger production deployment.
- Other branches create protected previews, not production replacements.
- Historical evidence already tracked in Git is preserved. New/changed local
  capture reports are not included in this release's commits. No private games,
  browser saves, environment files or sibling applications are uploaded.

## Vercel project

- Account/team: `softtech10` (existing Vercel Hobby account).
- Dedicated project: `linea-chess-analyzer`; framework Vite; Node.js **24.x**.
- Public URL: **https://linea-chess-analyzer.vercel.app**.
- Initial verified deployment: `dpl_2uvyjuv5wYDVzyyU3KUdMyfyJpNR`, source
  commit `1f8ce87` on `redesign`; Git-triggered Linux cloud build is Ready.
- Repository root is this application folder, not the multi-app workspace.
- Install: `npm ci`.
- Cloud gate: lint, pinned opening-data check, full unit tests, then `vite build`.
- Public output: `dist/` plus the restricted `/api/chesscom/resolve` function.
- Production is public; previews retain Vercel Authentication.
- No paid plan upgrade, database, account/login system or AI provider is added.
  Hobby remains subject to its personal/non-commercial terms and free-tier limits.
- `.vercel/` is a local project link; the CLI-generated `.env.local` is ignored
  and contains operator-only deployment metadata, not app configuration.

## Why the small hosted API is necessary

Vite's existing Chess.com public-link middleware does not ship in a static build.
The Vercel function exports the same shared handler, preserving numeric public
Chess.com live/daily URL validation, redirect allowlisting, a 12-second timeout,
2 MB content cap, small metadata-only cache, and serial request handling. The
handler returns a Promise so Vercel waits for it. A warm instance accepts at most
two outstanding lookups, returning 429 for an excess backlog. This limit is
per-instance, not a global abuse/rate-limit guarantee.

The function never forwards client cookies or credentials, returns only candidate
usernames/month (not private game data), and does not act as an arbitrary proxy.
Chess.com anti-bot errors may yield empty metadata; the UI's username fallback is
still necessary. Official public Chess.com/Lichess archive requests remain direct
browser requests, subject to provider limits. Local Stockfish computation stays
on the user's device. No language AI key is required.

## Delivery behavior

- Existing paths retain their MIME types; WASM is `application/wasm`.
- Extensionless SPA paths fall back to the app document. `/api/` and file paths
  are excluded from that fallback, so missing assets are not served as HTML.
- Security headers prohibit camera/microphone/geolocation and iframe embedding,
  set nosniff and a restrictive referrer policy. No cross-origin-isolation header
  is required by the vendored single-thread engine.
- Service worker and version manifest revalidate. Offline caches are versioned
  by the exact app/engine/asset bytes. A browser may need reload to install a new
  version. Network APIs are never cached by Linea's service worker.
- IndexedDB reviews and localStorage preferences belong to their browser origin.
  Localhost saves do not transfer to the new hosted URL. No saved personal data
  is uploaded as part of deployment.
- Stockfish, piece/model/icon/sound notices are retained. See THIRD_PARTY.md and
  the asset manifest for existing provenance and rights limitations; deployment
  is not a new rights-clearance claim.

## Safe updates

```sh
# From this project directory, on redesign:
npm ci
npm run lint
npm run check:openings
npm test
npm run build
# Stage only intended source changes; do not include environment files/captures.
git add <changed-source-files>
git commit -m "Describe the change"
git push origin redesign
```

Watch the dedicated Vercel project's deployment status and verify the public URL.
Do not force-push, merge over the baseline or change another project's settings.
The optional CLI route is `vercel --prod --scope softtech10` from this linked
folder only; it uses `.vercelignore` to omit local evidence and secrets.

## Verification status

Initial hosting gate: lint, legal opening-data check, **417/417 unit tests**
(including three new hosted-handler checks), production build and production
package audit pass (zero reported vulnerabilities). Existing large optional
opening/3D bundle warnings remain unchanged; this task does not redesign chunks.
The Git-triggered Linux cloud clean installation, lint/data check, all 417 unit
tests, build and deploy succeeded; no portable-lockfile change was needed.
Vercel removed 592 ignored source/evidence files before building. Only the
production app assets and one 4.38 KB API function were deployed.

**19/19 local production Chromium workflows** passed in one final run (no retries),
covering branch review, current-root explanations, illustration/playback and
evidence preservation. This is the targeted relevance/branch/explanation suite,
not every historical browser suite.

**12/12 real hosted Chromium checks** passed in the final full run:

- Public HTTPS and security headers.
- SHA-256 byte equality for all 63 app, model, demo, piece/notice and engine files
  checked; pinned worker/WASM hashes and WASM MIME. The version manifest is
  excluded from equality because Vercel omits OS metadata; its cache installs
  correctly in the separate native offline test.
- Secret/source/capture/missing paths return 404; numeric-game resolver rejects
  unsafe URLs (400) and unsupported methods (405), with real JSON responses.
- Extensionless `/sample` navigation/reload.
- Native four-ply Stockfish review and persisted accepted evidence, legal
  alternate-move grading, exact Return to original PGN/position and reload.
- All four visible homepage demo videos decode and play, without mocked media.
- Emulated iPhone PGN import/tap moves, review-panel Return, square board and
  no horizontal overflow.
- No console/page errors or unexpected failed app requests. Explicit Chromium
  `net::ERR_ABORTED` cancelled lazy video range downloads are recorded separately;
  HTTP errors or decoder failures are not exempted.

**Hosted native offline workflow passed:** a real completed review was saved,
the versioned service worker installed/controlled the app, and a direct game-route
reload while offline retained 64 board squares, original PGN and the exact
immutable accepted evidence hash. Normal restore wrapper timestamps/ids may
update; this is not a reanalysis. External Google Fonts may use fallback offline.

Hosted desktop home and phone board captures were visually inspected. All test
contexts used temporary synthetic studies, not a user's browser profile.
Run `node scripts/verify-hosted.mjs` and
`node scripts/verify-hosted-offline.mjs` after a fresh build to repeat hosted checks.
The two scripts use local dev-only Playwright; no testing library is sent to the
client. Results/captures are local under `artifacts/testing/vercel/`.

Initial hosted test assertions were corrected without changing the application:
lazy clips were checked while visible in normal-motion mode rather than hidden
in reduced-motion mode; mobile Return was correctly accessed in the user-selected
review panel; explicit cancelled video ranges were separated from real failures;
and offline comparison now checks immutable evidence rather than restore metadata.
The final full hosted run and final offline workflow both passed.

Safari/Firefox, physical phones, long-session engine performance, human screen
readers and real-user provider imports remain release checks. This deployment
will not be described as a rerun of every historical suite.
