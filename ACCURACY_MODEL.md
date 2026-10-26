# Linea Accuracy v2 and experimental game Elo

Implemented 20 October 2026. Stockfish.js remains **19.0.1 lite-single**, unchanged
JS/WASM assets. These are independent Linea estimates, not Chess.com scores.
This update does not implement the separate homepage/library/batch product plan.

## Evidence before arithmetic

The reviewer retains the initial FEN **and every recorded UCI move**. Searches and
resume reconstruct that history, including repetition; accepting-sacrifice boards
also reconstruct original history before applying the accepting capture. Mover
colors come from legal chess.js move records, not odd/even indices.

Each generation records content SHA-256, engine JS/WASM hashes, policy, classifier
and accuracy versions. Every evaluation stores actual reached depth, target, time
budget, elapsed time, nodes/NPS when provided, score, PV and source. Rule outcomes
have zero native search depth. Display settings never relabel existing evidence.

Base review limits remain Quick 12/450/600 ms, Balanced 16/1100/1400 ms and Deeper
20/3000/4000 ms (target depth / position budget / acceptance budget). Reached depth
is not calibrated confidence, and target depth may not be reached.

### Disputed moves

Trigger additional work for a nonterminal after-position with more than one legal
move before it when any of these occurs:

- loss above 7 percentage points, absolute chance swing above 12;
- an earlier PV-best move apparently loses more than 1 point;
- a winning mate is lost;
- loss lies within 0.35 points of the 3/7/15 classification boundaries.

The unrestricted best and restricted played-move searches use the **same historical
root, MultiPV=1, target min(24, base+2), and twice the base time limit**. UCI
`searchmoves` restricts the played search. This improves comparability; it does not
guarantee equal searched nodes, equal reached depth, independent transposition
hashes or minimax proof. Both searches, their initial/refined loss and limits are
retained. The refined pair determines numeric loss for that move, while original
mainline evaluations remain available for the graph and volatility.

Depth below 12, a played search exceeding the unrestricted best by more than 1
chance point, or a same-best move still losing more than 1 point makes verification
**provisional**. It is not silently assigned 100%. Low-depth mainline judgments
are also provisional. Accuracy remains a labelled partial/provisional estimate;
final complete status and experimental Elo require non-provisional coverage.

An optional third MultiPV=2 search supports gap-dependent Great/Miss labels only.
Its two lines must have equal actual depth >=12; its first choice must agree with
the unrestricted best and its chance score within 1 point. It never replaces the
numeric best-versus-played pair. A disputed move can therefore add up to three
searches, each with twice the base position budget.

## Deterministic scoring

Reference sources, exact revisions, licenses and hashes are retained in the
[reference notice](vendor/accuracy-reference/NOTICE.md). The formula/window tests
compare a source-transliterated reference and explicit numeric values to 1e-9;
no Scala runtime was executed. This is not a claim of identical engine results or
full Lichess application parity.

For finite White-perspective centipawns:

```
W(cp) = 100 / (1 + exp(-0.00368208 * clamp(cp, -1000, 1000)))
loss = max(0, (W(before) - W(after)) * moverSign)
moverSign = +1 for White, -1 for Black
A(loss) = clamp(103.1668100711649 * exp(-0.04354415386753951 * loss)
                - 3.166924740191411 + 1, 0, 100)
```

Nonpositive loss gives 100. The source includes the **+1 uncertainty bonus**.
No missing score defaults to 0 cp. Mate uses signed +/-1000 cp; mate-zero requires
an explicit winner, signed score or side-to-move evidence. A mate delay preserving
the same winner has no artificial accuracy penalty. Mate evaluations are retained
separately even though chance conversion saturates. The heuristic chance scale is
not literal game-result probability: with +/-1000 clipping its endpoints are
approximately 2.46%/97.54%, including terminal-mate scoring.

### Game aggregation

Let N be recorded plies. Window size is `clamp(floor(N/10), 2, 8)` positions. Use
the reference sliding-window alignment, including `windowSize-2` copies of the
first window, then consecutive full windows. Population standard deviation of
White chance percentages gives a weight clamped to [0.5,12]. Missing windows are
unavailable, not filled with assumed values. All position evidence is retained
and weights can be recomputed as partial coverage increases.

For each actual color separately:

```
weighted = sum(moveAccuracy * weight) / sum(weight)
harmonic = count / sum(1 / max(1, moveAccuracy))
gameAccuracy = (weighted + harmonic) / 2
```

The `max(1, accuracy)` denominator is present in the pinned scalalib reference.
No short-game smoothing, garbage-time dampener, rating adjustment or label-based
100% override is added. Forced and Book moves remain numerically scored; their
labels do not prove perfect play. Empty samples return unavailable, not 100%.
The displayed combined score uses the same aggregation over both players' moves;
it is not the simple mean of two side scores.

**Intentional Linea differences:** the initial position is actually evaluated
instead of inserting a fixed initial cp; arbitrary valid start FENs use their
actual mover colors; root-verification losses can refine move accuracy while
volatility and graph continue to use raw played-position evidence.

## Rules and classifications

Supported report/board/list categories are Book, Forced, Brilliant, Great, Best,
Excellent, Good, Inaccuracy, Mistake, Miss and Blunder. They are independent Linea
heuristics, not proprietary provider labels.

- **Forced:** only one legal move. No manufactured 100% numeric score.
- **Book:** consecutive actual positions match the pinned local CC0 dataset,
  standard-start games only, non-provisional loss <=3. Supplied opening names or
  first-N-ply assumptions do not establish Book evidence.
- **Brilliant:** described below; replaces the base label only after acceptance
  verification, and never changes numeric accuracy.
- **Great:** verified non-provisional best, loss <=1, matching-depth candidate
  chance gap >=12. Not awarded without actual second-line evidence.
- **Best:** current comparison PV1 matches played move and loss <=1. A conflicting
  earlier PV cannot hide a large loss under this label.
- **Excellent/Good/Inaccuracy/Mistake/Blunder:** loss <=1/3/7/15/>15 respectively,
  unless a more specific evidence-backed rule applies.
- **Miss:** non-provisional lost winning mate with loss >3, or loss >7 after an
  opponent Mistake/Blunder/Miss with verified candidate gap >=12.

### Brilliant detection

Requires an engine-preferred non-pawn/non-king move, no promotion, <=1.5 points of
loss, non-provisional mainline searches >=12, after-evaluation >=-50 mover cp and
before-evaluation <=+500 mover cp. A legal capture of the offered moved piece must
risk >=1.5 material points (or, since 21 Oct 2026, give a piece worth >=3 for pawns at >=1 point net;
reference: Chess.com game 185626013138, 9...Bxa3) after legal exchange accounting and the move's original
capture. Equal trades and simply attacked pieces are insufficient.

Exchange analysis is bounded to depth 6, 48 nodes and three legal captures per
branch. If those bounds truncate an exchange, it cannot establish a candidate.
The selected accepting capture gets a separate history-aware engine search. It
must reach depth >=12 (or an exact terminal result), preserve >=-50 mover cp and
stay within 75 cp of the original after score. Claim availability is not an exact
terminal result. Ratings never relax these thresholds.

This detects a conservative subset, mainly immediately capturable moved pieces.
It can miss positional/delayed sacrifices, sacrifices of a different piece,
brilliant defensive ideas and other human judgments. Bounded SEE and an acceptance
search are not proofs against every possible opponent reply.

### Draws and special moves

- Threefold repetition and fifty-move availability are recorded as **claims**;
  they do not force an exact draw or skip native analysis.
- Fivefold repetition and 150 reversible plies are automatic draws, with checkmate
  taking precedence. Stalemate and chess.js insufficient-material outcomes are
  rules-derived. No remote tablebase or complete general dead-position solver.
- Resignation, agreement, timeout or a PGN result does not retroactively replace
  earlier position evaluations with that final result.
- Legal chess.js parsing/replay retains castling, en passant, promotion and
  underpromotion, Black-start FEN and repetition history.
- An impossible starting position with the non-moving king attacked is rejected
  before starting Stockfish. This is not a complete legal-reachability proof.

## Experimental game Elo (explicit user request)

This feature was added after the earlier MVP prohibition was superseded by the
user's explicit game-Elo request. It is **not a serious calibrated rating
measurement**, not Elo/Glicko, not Chess.com's unknown game-rating algorithm and
not a confidence interval. It never affects accuracy/classification. The UI says
this before presenting a number, inside an explicit expansion.

Requires a completed recorded result, complete compatible non-provisional review,
not the fictional bundled sample, the player's PGN rating, and >=10
non-Book/non-Forced decisions **for both players**. Otherwise display Unavailable
and the reason. Actual imported rating tags are evidence supplied by the PGN, not
verified account ownership.

**Current version `linea-experimental-game-elo-4` (22 Oct 2026 reliability audit):**

```
estimate = ownPgnRating + clamp(20 * (ownAccuracy - opponentAccuracy), -600, 600)
Output = clamp(estimate, 100, 3200), rounded to nearest 10; calibrated: false
```

elo-3 fitted two constants exactly to the two sides of one Chess.com review
(game 185626013138), which is interpolation, not calibration; it is retired and
kept only as fixture provenance. The accuracy-difference form cancels effects the
two players share. Its single scale factor was chosen on a small public-game set
with disclosed holdout contamination; see the
[reliability audit](artifacts/testing/review-comparison/REPORT.md). Policy-3,
classifier-3 and book-2 from the same audit are described there as well.

Historical version `linea-experimental-game-elo-1`:

```
v = mean of that player's volatility weights
c = clamp(0.75 + (v - 1.5) * 0.15, 0.75, 1.35)

With a valid PGN rating r:
  expectedAccuracy = 58 + 36 / (1 + exp(-(r - 1350) / 500))
  estimate = r + (gameAccuracy - expectedAccuracy) * 28 * c

Without a valid PGN rating:
  a = clamp(gameAccuracy, 30, 99.5)
  estimate = 400 + 2550 * ((a - 30) / 69.5)^1.85 * (0.85 + 0.15*c)

Output = clamp(estimate, 100, 3200), rounded to nearest 10
```

The coefficients and baseline are arbitrary assumptions from the proposed model,
not learned/calibrated parameters. PGN anchors intentionally influence the number;
Chess.com, Lichess and FIDE numerical rating scales must not be mixed. A small
sample or long lost/won position can give misleading estimates even with the
gates. Do not use this for player ranking, selection or strength claims. Serious
rating inference remains blocked on a suitably licensed rated-game calibration
corpus, out-of-sample validation and explicit uncertainty methodology.

## Evidence and reproducibility

Use **Report -> How this score is calculated**, **Evidence for this move**, and
**Download review evidence (JSON)**. The export contains original PGN, versioned
generation, per-move raw/refined scores, actual colors, labels, weights, depth/time
limits, root rechecks, acceptance evidence and experimental rating inputs.
Nothing is uploaded. Accuracy v2 originally shipped session-local. The subsequent
product-foundation increment now saves compatible checkpoints and legal workspace
drafts in this browser; incomplete work offers explicit resume, never background
computation after tab closure. The numerical formulas/classifier/policy/engine
assets in this document are unchanged. See the
[product-foundation worklog](artifacts/testing/product-evolution/WORKLOG.md).

- [Implementation/evidence worklog](artifacts/testing/accuracy-v2/WORKLOG.md)
- [Native 14-fixture / 20-run benchmark](artifacts/testing/accuracy-v2/native-benchmark.json)
- [Same-evidence formula comparison](artifacts/testing/accuracy-v2/model-comparison.json)
- [Verification summary and variability](artifacts/testing/accuracy-v2/summary.json)
- [Deterministic scenario tests](tests/unit/accuracy-v2.test.js)
- [Native/browser acceptance tests](tests/browser/accuracy-v2.spec.js)

No single percentage is objective chess truth. Serious analysis here means
traceable evidence, reproducible arithmetic, honest unknown/provisional states,
and tested legal/rules behavior—not a guarantee of matching another website or
covering every possible position.
