# Linea product evolution — phase delivery log

User-approved plan: Linea product evolution and redesign, 20 October 2026.
Visual direction: classic Staunton pieces + realistic wooden board; exact models
and finishes remain pending candidate inspection/approval. The practical 2D board
keeps its own saved palette preferences.

## Phase 0 — checkpoint and baseline (complete)

- Preserved [Accuracy v2 source checkpoint](phase0/accuracy-v2-source-checkpoint.tar.gz)
  and [source comparison](phase0/source-checkpoint.json): no changed members relative
  to the frozen Accuracy v2 identity.
- Fresh lint, 3,865 opening-record validation, all 269 units, production build,
  75 Chromium, 18 native-engine, six Firefox/WebKit and three production workflows
  passed sequentially. Zero failures/skips/retries. Base model unchanged.
- Existing lazy opening-data chunk size advisory remains; build passes.
- Frozen rerun evidence is in [Phase 0](phase0/), separate from prior delivery records.
- No project-local AGENTS instructions were found in the checked paths.
- Chronos: adapt hero/import/overview/guided interactions; never migrate synthetic
  histories, index-derived accuracy, incomplete legality, simulated evaluations,
  invented rating changes, global provider HTML or hidden continuous animation.
- Supplied overview/guided mockups were not found in workspace/Downloads during
  planning; no claim of visual inspection. The confirmed two-column contract governs.

## Phase 1 — local-data/job-ownership foundation (complete)

### Delivered

- [Native IndexedDB library](../../../src/library.js), scoped to `linea-library`:
  original games/positions, versioned raw reviews, drafts, and stores ready for
  later accounts/batches/reports. Schema upgrades use IndexedDB upgrade events;
  writes succeed only on transaction completion. No localStorage game blobs.
- [Single persistence owner](../../../src/useLocalLibrary.js): saves review events
  independently of panel rendering; original PGN is never mutated. Browser-local
  recent games, delete/clear confirmation, export-safe failures and Retry saving.
- [Checkpoint validation](../../../src/reviewCheckpoint.js): full content/engine/
  policy/scoring identity, original positions, actual colors/UCIs, contiguous
  coverage, mainline/root/acceptance evidence and numeric consistency. Invalid or
  stale results are retained but not used as current evidence. The final-move
  checkpoint can recover completed work even if closure preceded its final status.
- [Route state](../../../src/workspaceRoute.js): encoded saved-game URLs, selected
  ply/report view and back/forward restoration. [Draft recovery](../../../src/workspaceDraft.js)
  legally reconstructs temporary variations and filters marks; it never treats a
  FEN alone as the recorded repetition history.
- Pending quality and displayed review policy persist separately. Reload restores
  the existing evidence and pending choice, without reanalysis/reclassification.
  Interrupted saved work offers explicit Resume. New analysis does not delete
  previous saved games. The bundled illustrative sample is not automatically saved.
- [Engine coordinator](../../../src/engineCoordinator.js): one lazy shared worker,
  origin-wide Web Lock spanning a review (including gaps between searches), safe
  preemption only after stop acknowledgement, and no worker per library row.
  Deliberate live-position requests pause review; navigation remains legal and
  responsive. Hidden-document handling pauses work; no claim of closed-tab compute.
- [Recent-games UI](../../../src/LibraryDialog.jsx) with browser/device disclaimer,
  storage errors/retry, delete/clear controls and visible saving status. The existing
  rail layout remains pending its explicitly planned two-column replacement.
- [Production offline caching](../../../public/linea-sw.js) plus a build-generated
  byte-versioned app/engine/piece manifest. No provider-response or background-job
  cache. No automatic service-worker takeover of a running review. Updates wait
  until all Linea tabs close. Development intentionally has no service worker.

The numerical Accuracy v2 modules, classifier, review policy, Brilliant algorithm,
experimental rating formula, UCI transport and pinned engine bytes are checksum-
unchanged. The [summary](phase1/summary.json) records those comparisons. Review
session changes add restoration/ownership cancellation, not formula changes.

### Verification

Final source SHA-256:
`be0674a9117235acff576c9fe993ea06a1a87d552f7b29058afcc1c7f0805525`.
All final browser suites report the same unchanged pre/post source and no host
execution gaps. Suites ran sequentially with one browser worker and zero retries.

| Gate | Result | Evidence |
| --- | --- | --- |
| Lint, 3,865-record opening validation, build | Passed | Terminal execution and source identity |
| Units | **281 passed** | [Frozen report](phase1/final-unit-results.json) |
| Existing Chromium workflows | **75 passed** | [Report](phase1/final-browser-results.json) |
| Native Stockfish/accuracy workflows | **18 passed** | [Report](phase1/final-engine-browser-results.json) |
| Firefox/WebKit core regressions | **6 passed** | [Report](phase1/final-crossbrowser-results.json) |
| Compiled production regressions | **3 passed** | [Report](phase1/final-production-browser-results.json) |
| New product state/recovery workflows | **12 passed** | [Report](phase1/final-product-foundation-results.json) |
| Production offline full workflow | **1 passed** | [Report](phase1/final-product-offline-results.json) |

**115 browser/engine workflows, no final failure/skip/flaky/error/retry.**
The new Chromium tests prove actual IndexedDB complete/partial reload, original
history resume, unchanged saved generation, no worker on completed cache reopen,
pending-quality isolation, one shared native worker, cross-tab exclusive denial,
back/forward, stale-version exclusion, deletion stopping writes, additive/blocked
schema upgrade and quota-aborted checkpoint recovery. Quota failure is injected
inside a real IndexedDB transaction, not a real disk-full claim.

The offline production test disables network after caching, reloads the saved
review at its selected ply without a worker, then deliberately starts a real
native position search from cached JS/WASM. See [cache evidence](phase1/offline-cache.json).
This does not mean the Vite development server can reload offline.

New library desktop/phone axe scans have zero detected violations; existing axe
regressions pass. Inspected [desktop](phase1/library-1440.png),
[phone](phase1/library-390.png), and [offline review](phase1/offline-review.png)
captures. The current narrower report remains the old layout, not the finished
redesign. Physical device and human assistive-technology review remain manual.

### Failures and corrective work

- First new browser run found a quota exception thrown inside an IndexedDB success
  callback getting reduced to a generic abort, plus a saved-row accessible name
  not matching its full visible text. Transaction callback guards now preserve the
  cause and the row uses its visible content as its accessible name; full rerun passes.
- The first broad old-suite run hit outdated automatic-live-engine/two-worker
  assumptions and exceeded the tool time limit. Only its verified dead QA lock and
  owned orphan QA server were cleaned up. [Interrupted lock record](phase1/interrupted-browser-lock.json).
  Tests now deliberately request live analysis and verify one worker plus unchanged
  review identity/budgets. No broad timeout increase or retry policy was introduced.
- Native pause/resume can leave a bounded judgment provisional. Its regression now
  requires every ply processed/scored, and requires a real provisional count if the
  UI calls full processed coverage partial. It does not force a final score.
  [First native attempt](phase1/native-first-attempt.json),
  [final pause evidence](phase1/native-pause-coverage.json).
- A time-bounded full historical review produced Brilliant instead of its former
  Excellent label on one run. The isolated fixed-depth preference regression is
  unchanged; the full review now verifies actual acceptance/cost/depth/loss evidence
  and exact list/board/report agreement rather than hard-coding a historical badge.
  No threshold or score was changed to obtain a pass.
  [Observed first report](phase1/historical-label-first-attempt.json),
  [final exported evidence](phase1/historical-review-evidence.json).
- Recovery review found and corrected pending/displayed-quality conflation, and a
  startup-failed shared engine that needed disposal for a real Retry. Dedicated
  regressions cover both. Valid final-ply evidence cannot become permanently stuck
  as an unresumable paused generation.

### Limits and next increment

- New storage/offline/cross-tab tests are Chromium-specific. Existing Firefox/WebKit
  engine/UI suites pass, but their full new storage/update matrices, installed
  browsers, real-device hidden-tab behavior and human accessibility remain release
  checks. Browsers without Web Locks refuse engine work explicitly instead of
  falling back to an unsafe timer lease; legal board/saved evidence remain usable.
- IndexedDB can be erased/evicted by the browser. Service-worker asset preparation
  must succeed before offline reload is available. Cache/data are per origin and
  device, not synchronized across browsers. Save failures retain current memory.
- The existing lazy opening-data size advisory remains. No new audit, dependency
  upgrade or external live-provider test was added.
- Frozen Accuracy v2 final suite reports/checkpoints remain preserved. Some earlier
  tests use mutable native-benchmark paths; baseline reruns refresh those outputs.
  This increment's own frozen benchmark is [here](phase1/native-benchmark.json).
- **Not yet implemented:** unified latest-10 filtered public history, 30-row browsing,
  maximum-10 selection/batches, the two-column overview/guided interface, aggregate
  player reports or a 3D homepage. No fabricated placeholder versions were added.
- Next planned phase is the unified provider browser and selection contract. Exact
  Staunton/wood assets/finishes still need inspection and user approval before final
  hero appearance. Missing mockups remain explicitly recorded, not guessed as seen.

## Delivery boundaries

No deployment, GitHub push, asset purchases or unrelated application edits. Each
phase must pass its gate before dependent work is credited as complete. The durable
plan tracks the remaining phases; Phase 1 completion is not full-MVP completion.
