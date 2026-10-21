# Verification fixtures

## Historical exchange sacrifice

[kasparov-topalov-1999-prefix.pgn](kasparov-topalov-1999-prefix.pgn) is the legal
mainline of Garry Kasparov–Veselin Topalov, Hoogovens Group A, Wijk aan Zee,
1999-01-20, through 23...Qd6. It is intentionally truncated with result `*`, not
represented as the complete historical game. Tests add 24.Rxd4 and check the
actual local Stockfish search and an accepting 24...cxd4 continuation.

Reference sources consulted:

- [Chess.com: 25 Years Ago, Kasparov–Topalov Was Played In Wijk Aan Zee](https://www.chess.com/news/view/25-years-ago-kasparov-topalov-1999)
- [Chessgames record, game 1011478](https://www.chessgames.com/perl/chessgame?gid=1011478)
- [Printable score](https://www.chessgames.com/perl/printgame?gid=1011478)

The native engine tests do not assume the historical result proves every
sacrifice sound. A correct engine-approved move and separately evaluated legal
acceptance are required for the independent Brilliant heuristic.

**Stockfish 19.0.1 upgrade:** the pinned lite-single build prefers 24.Nc6 at
depth 20 in this position and returns Excellent for 24.Rxd4 under the unchanged
Linea classifier. The full depth-16 review also shows Excellent. This fixture is
retained as a negative/version-change regression, not forced to reproduce
Stockfish 18's former Brilliant label. Native before/after evidence is saved.

## Constructed Stockfish 19 drawing sacrifice

[stockfish19-drawing-sacrifice.pgn](stockfish19-drawing-sacrifice.pgn) is an
explicitly synthetic FEN regression, not an attributed historical game. The
white rook offers 1.Rxc2+; 1...Kxc2 leaves a nonterminal pawn ending. The pinned
19.0.1 engine selected this move and returned draw evaluations in three separate
depth-16 searches (before, after and accepting capture) using the actual current
1,100/1,100/1,400 ms review budgets. Bounded legal exchange analysis finds four
points at risk. The unmodified classifier qualifies it as Brilliant.

Both a standalone native-evidence test and the actual game-review UI must pass.
No score, depth or acceptance result is mocked, and no heuristic threshold was
changed to accommodate the engine upgrade. It demonstrates Linea's existing
definition, not a promise of matching another site's or a human's labels.

Other short game, PGN clock, promotion and constructed tactical fixtures are
synthetic regression inputs. Transport tests use a labeled fake UCI worker to
verify cancellation and parser boundaries; browser engine tests load the actual
vendored WASM and do not synthesize engine scores. Chess.com error-path browser
tests explicitly intercept HTTP; separately named live tests contact the real
Published Data API and local metadata resolver.
