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
Local production browser and hosted deployment checks are in progress.

Safari/Firefox, physical phones, long-session engine performance, human screen
readers and real-user provider imports remain release checks. This deployment
will not be described as a rerun of every historical suite.
