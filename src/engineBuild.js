// User-requested pre-Phase 2 upgrade: pin the official Stockfish.js 19.0.1
// lite SINGLE-thread pair. No SharedArrayBuffer/isolation headers, CDN loading,
// thread selector or implicit fallback to the previous engine is introduced.
// Matching release asset hashes and source provenance are in public/engine/NOTICE.md.
export const ENGINE_BUILD = Object.freeze({
  name: 'Stockfish 19 Lite',
  version: '19.0.1',
  variant: 'lite-single',
  threads: 1,
  uciName: 'Stockfish 19 Lite WASM',
  workerUrl: '/engine/stockfish-19-lite-single.js',
  wasmUrl: '/engine/stockfish-19-lite-single.wasm',
  release: 'https://github.com/nmrugg/stockfish.js/releases/tag/v19.0.1',
  sourceCommit: '0d5dd7944f88c817c07a26bc4fb1905d5f9c46d6',
  workerSha256: 'ccb130d7ff29408531c47d859a49f91d59d4f482d05a53eb1a3231a4f624c91a',
  wasmSha256: 'ee4f115bdb2d32cadf96cada104a05b5ec257d7ad6f57582190b49bc71f096de',
});
