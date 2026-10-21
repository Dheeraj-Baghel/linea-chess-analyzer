# Third-party assets

## Stockfish.js 19.0.1 - lite, single-threaded

At the user's request, the former 18 runtime was replaced by the unmodified
official [19.0.1 release](https://github.com/nmrugg/stockfish.js/releases/tag/v19.0.1)
lite-single JS/WASM pair. Byte lengths and SHA-256 digests match GitHub's release
metadata. Native UCI identifies `Stockfish 19 Lite WASM`, with Threads min/max 1.
It runs as a separate local worker and requires no cross-origin isolation headers.

- JavaScript: [stockfish-19-lite-single.js](public/engine/stockfish-19-lite-single.js)
- Binary: [stockfish-19-lite-single.wasm](public/engine/stockfish-19-lite-single.wasm)
- License: [GPLv3](public/engine/LICENSE.txt)
- [Attribution, hashes and source links](public/engine/NOTICE.md)
- [Pinned upstream source](https://github.com/nmrugg/stockfish.js/tree/0d5dd7944f88c817c07a26bc4fb1905d5f9c46d6)
- [Local pinned source archive](artifacts/testing/stockfish19/stockfish-source-0d5dd7944f88c817c07a26bc4fb1905d5f9c46d6.tar.gz)
- [Source archive checksum](artifacts/testing/stockfish19/source-archive-manifest.json)
- [Build documentation](https://github.com/nmrugg/stockfish.js/blob/v19.0.1/README.md#how-do-i-compile-the-engine)
- Upstream chess engine: https://github.com/official-stockfish/Stockfish

Copyright 2026 Chess.com, LLC and the Stockfish contributors. Original notices
are retained. Lite network: Chris Bao (sscg13), `nn-61e7af4bb97d`. Preserve the
GPLv3 license and satisfy corresponding-source requirements when conveying the
engine; the source link alone is not asserted to settle all obligations. No
public redistribution/deployment was performed for this local-preview task.
The old 18 pair is retained only in rollback evidence, not in served assets.

## Skak chess pieces

The twelve unmodified SVG pieces, provenance notice and upstream LPPL 1.3c text
were copied from existing workspace assets. Their original provenance and
license caveats remain in the included notice. No geometry or colors were edited.

- [Provenance notice](public/pieces/skak/NOTICE.txt)
- [LPPL 1.3c](public/pieces/skak/LICENSE-LPPL-1.3c.txt)
- SVG conversion: https://github.com/MuTsunTsai/skak-svg
- Original work: https://github.com/lehoff/skak

The alternative Figurine style uses operating-system Unicode chess glyphs, not
another downloaded piece set.

## CC0 opening dataset

The local opening index derives from
[lichess-org/chess-openings](https://github.com/lichess-org/chess-openings) at
commit `a6189a30dc273ccb21fc2536a9a2fefd5592a67a`. Its upstream README dedicates
copyright in the collection to CC0. All 3,865 source PGNs validate with the
existing chess.js dependency. Original TSVs, the copyright declaration, hashes
and deterministic generation instructions are retained in the
[vendor notice](vendor/chess-openings/NOTICE.md). Opening data is not proprietary
review scoring. Public provider games are fetched only on explicit user action.

## Accuracy v2 reference adaptation

The [accuracy module](src/accuracy.js) adapts lila AccuracyPercent.scala at
`ea60d3bc7e9997f8f182d9dc3f3d468a036df20a`, copyright the lila authors,
**AGPL-3.0-or-later**. Pinned scalalib Maths and scalachess evaluation references
have their MIT notices retained. Exact upstream sources, revisions, SHA-256 and
license texts are in the [accuracy reference notice](vendor/accuracy-reference/NOTICE.md).
The [model documentation](ACCURACY_MODEL.md) identifies Linea-specific changes.
No publication/deployment occurred. Before redistribution/network publication,
review corresponding-source and other applicable AGPL/GPL obligations; keeping
links alone is not asserted to satisfy all requirements.

## Fonts and npm packages

The Phase 1 stylesheet optionally requests DM Sans from Google Fonts; Instrument
Serif is no longer requested. Font downloads are separate from game data and are not needed for board
or engine functionality. System font fallbacks are supplied.

React, Vite, the React Vite plugin, chess.js and Lucide React are npm dependencies;
the lockfile records installed versions and their packages carry their own
license notices. No existing application's application code was copied.

## Homepage Staunton pieces

Poly Haven "Chess Set" by Riley Queen, CC0 1.0 - https://polyhaven.com/a/chess_set.
Pieces only (board node removed); see [public/models/staunton/NOTICE.md](public/models/staunton/NOTICE.md).

## Board pieces (current)

Cburnett SVG set by Colin M.L. Burnett (Wikimedia Commons), used under its BSD option
(also GFDL/GPL). See [notice](public/pieces/cburnett/NOTICE.txt). The skak set below is retained but no longer referenced.

## Move sounds

`public/sounds/` holds Chess.com move/capture/check MP3s added at the user's request. **No licence verified - replace before any public deployment.** See [notice](public/sounds/NOTICE.txt).
