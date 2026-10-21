# Vendored opening data

Source: [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings)
at commit [a6189a30dc273ccb21fc2536a9a2fefd5592a67a](https://github.com/lichess-org/chess-openings/tree/a6189a30dc273ccb21fc2536a9a2fefd5592a67a).

The upstream [README](README.md) states the facts are public domain and dedicates
any copyright in their curation to **CC0**. This is not proprietary provider
scoring data. Original TSVs and SHA-256 values are preserved in
[provenance](provenance.json).

The [build script](../../scripts/build-openings-index.mjs) validates every PGN
with the existing chess.js dependency and generates a local EPD-keyed index.
Side to move, castling rights and legal en-passant state are retained; move
counters are omitted. The generated index is loaded as a separate local bundle,
never fetched from a remote opening service during analysis.

Opening labels describe the recorded game. Valid supplied PGN Opening/ECO
headers take precedence and are labeled supplied. Without them, the deepest
recorded position matching the index wins. Exact UCI sequence, canonical line
length and stable ECO/name/UCI ordering resolve ties. Transpositions are labeled;
unknown lines and arbitrary FEN positions do not receive fabricated opening names.
