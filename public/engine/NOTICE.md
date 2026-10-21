# Stockfish.js 19.0.1 - lite, single-threaded

Unmodified official release assets from
[nmrugg/stockfish.js v19.0.1](https://github.com/nmrugg/stockfish.js/releases/tag/v19.0.1),
published 10 October 2026. Selected for Linea at the user's request before Phase 2.

- Worker: [stockfish-19-lite-single.js](stockfish-19-lite-single.js), 28,230 bytes.
  SHA-256: `ccb130d7ff29408531c47d859a49f91d59d4f482d05a53eb1a3231a4f624c91a`.
- Matching WASM: [stockfish-19-lite-single.wasm](stockfish-19-lite-single.wasm),
  1,845,971 bytes. SHA-256:
  `ee4f115bdb2d32cadf96cada104a05b5ec257d7ad6f57582190b49bc71f096de`.
- Both byte lengths and SHA-256 digests were checked against the upstream GitHub
  release asset metadata. They were not renamed from a different engine version.
- Native UCI identity: `Stockfish 19 Lite WASM`. Its Threads option has min/max 1.
  The pair loads in a browser worker without cross-origin isolation headers.
- Keep the matching JS and WASM adjacent and serve them with JavaScript and
  `application/wasm` MIME types. No runtime CDN request is used by Linea.

## License and corresponding source

Stockfish.js engine code is **GPLv3**, copyright 2026 Chess.com, LLC, based on
Stockfish by T. Romstad, M. Costalba, J. Kiiski, G. Linscott and other contributors.
The lite network is credited to Chris Bao (sscg13), `nn-61e7af4bb97d`.
The original notices in the JavaScript are retained. The accompanying
[GPLv3 license](LICENSE.txt) matches the release's Copying.txt.

- [Pinned source commit](https://github.com/nmrugg/stockfish.js/tree/0d5dd7944f88c817c07a26bc4fb1905d5f9c46d6)
- [Pinned source archive](https://github.com/nmrugg/stockfish.js/archive/0d5dd7944f88c817c07a26bc4fb1905d5f9c46d6.tar.gz)
- [Build instructions](https://github.com/nmrugg/stockfish.js/blob/v19.0.1/README.md#how-do-i-compile-the-engine)
- [Lite network reference](https://tests.stockfishchess.org/nns?network_name=nn-61e7af4bb97d)

The upstream instructions identify Emscripten 6.0.9 and the single-thread/lite
build options. The engine is unmodified; its non-engine upstream utilities have
separate MIT licensing. Preserve all relevant notices and satisfy GPLv3's
corresponding-source requirements when conveying the engine. A link alone is not
asserted here to settle every distribution obligation. No public deployment or
redistribution was performed for this local upgrade.
