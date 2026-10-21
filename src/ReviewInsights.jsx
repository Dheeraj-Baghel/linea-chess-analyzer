import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, ChevronRight, Lightbulb, Sparkles, Target } from 'lucide-react';
import { FEEDBACK, moveLabel } from './chess';
import { accuracySummary, coachingSummary, moveExplanation } from './review';
import { experimentalGameRatings, reviewExport } from './gameRating';
import MoveIcon from './MoveIcon';

const percent = value => value === null ? '—' : `${value.toFixed(1)}%`;
export function AccuracySummary({ game, review, compact = false, detailsOnly = false }) {
  const summary = useMemo(() => accuracySummary(game, review.records, review.generation?.id), [game, review.records, review.generation?.id]);
  const ratings = useMemo(() => experimentalGameRatings(game, review), [game, review]);
  const downloadEvidence = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(reviewExport(game, review), null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'linea-review-evidence.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className={`accuracy-summary ${compact ? 'compact' : ''}`} aria-label="Linea estimated game accuracy">
    {!detailsOnly && <><div className="accuracy-heading"><span className="eyebrow">LINEA ACCURACY <span title="An independent engine-derived estimate, not the accuracy reported by Chess.com.">ESTIMATE</span></span><strong>{percent(summary.overall)}<small>combined</small></strong></div>
    <div className="player-accuracies">{['w', 'b'].map(color => {
      const side = summary[color], name = game.headers[color === 'w' ? 'White' : 'Black'] || (color === 'w' ? 'White' : 'Black');
      return <div className="accuracy-player" key={color}><div><i className={`color-disc ${color === 'w' ? 'white' : 'black'}`} /><span title={name}>{name}</span><strong>{percent(side.accuracy)}</strong></div><progress value={side.accuracy || 0} max={100} aria-label={`${name}: ${side.accuracy === null ? 'not reviewed' : `${side.accuracy.toFixed(1)} percent estimated accuracy`}`} /><small>{side.reviewed} / {side.total} moves{side.complete ? ' · complete' : side.reviewed ? ' · partial' : ' · awaiting review'}</small></div>;
    })}</div>
    <div className="accuracy-coverage" role="status">{review.running ? review.stage || `Reviewing ${summary.reviewed}/${summary.total}…` : summary.complete ? 'Full game reviewed · estimates depend on search depth' : summary.reviewed ? `Partial review · ${summary.reviewed}/${summary.total} plies${summary.provisional ? ` · ${summary.provisional} provisional judgments` : ''}` : 'Run Review game to calculate accuracy, Brilliant moves and coaching.'}</div></>}
    {!compact && <><details className="accuracy-method"><summary>How this score is calculated</summary><p>Accuracy v2 uses the pinned Lichess-derived conversion: 100 / (1 + exp(−0.00368208 × centipawns)), clamped at ±1000 cp. Move accuracy is clamp(103.1668100711649 × exp(−0.04354415386753951 × chance loss) − 3.166924740191411 + 1, 0, 100). Player accuracy averages the volatility-weighted and harmonic means. Windows are 2–8 plies based on recorded game length. The initial evaluation is measured, not invented. Missing evidence is excluded and partial/provisional coverage is explicit. Labels never overwrite numeric accuracy; these estimates are not Chess.com’s scores or calibrated win probabilities.</p><p>Large swings, conflicting Best evidence, missed mates and close classification boundaries trigger additional same-root searches for best and played moves with equal limits. Actual depths and unresolved disagreement remain in exported evidence. Claimable draws are not forced terminal results.</p><p>Brilliant labels require an engine-preferred non-pawn sacrifice, legal exchange evidence of material at risk (at least 1.5 points, or a piece given for pawns), and a separate search after an accepting capture. Searches must reach at least depth 12, except exact terminal outcomes. Detection is deliberately conservative and can miss other brilliant ideas.</p></details>
    <details className="accuracy-method experimental-game-rating"><summary>Experimental game Elo estimate</summary><p>Uncalibrated heuristic—not an account rating, Elo/Glicko calculation, Chess.com game rating, or reliable measurement of playing strength. Requires complete non-provisional analysis and at least 10 non-book, non-forced decisions per player. Provider rating scales are not interchangeable.</p>{['w', 'b'].map(color => <p key={color}><b>{color === 'w' ? 'White' : 'Black'}: {ratings[color].value ?? 'Unavailable'}</b> · {ratings[color].reason || `${ratings[color].mode}; ${ratings[color].timeClass}; ${ratings[color].decisions} decisions`}</p>)}<p>Modelled on the inputs Chess.com says its Game Rating uses: your accuracy, your rating, your opponent's rating and the time control (its exact formula is not public). Linea compares your accuracy with the typical accuracy for a 70/30 blend of your and your opponent's PGN ratings at this time control, then converts the difference into rating points (curve fitted to one real Chess.com review, capped at ±1000). Without ratings it uses a 1500 reference. Treat it as a rough estimate.</p></details>
    <button className="button secondary full-width" disabled={!review.generation} onClick={downloadEvidence}>Download review evidence (JSON)</button></>}
  </section>;
}

export function MoveCoaching({ game, ply, record, onCompare }) {
  const move = game.moves[ply - 1];
  const explanation = useMemo(() => moveExplanation(move, record), [move, record]);
  if (!explanation) return null;
  const feedback = FEEDBACK[record.type];
  return <div className="move-coaching"><h4><span className="feedback-badge" style={{ '--feedback-color': feedback.color }}><span className="feedback-icon"><MoveIcon type={record.type} size={20} /></span>{feedback.label}</span><span>{moveLabel(move)}</span></h4><p>{explanation.body}</p>
    <div className="move-coach-metrics"><span>Evaluation <b>{explanation.before} → {explanation.after}</b></span><span>Move accuracy <b>{percent(explanation.accuracy)}</b></span></div>
    {explanation.alternative && <div className="better-continuation"><span>Compare: <strong>{explanation.alternatives.map(moveLabel).join(' ')}</strong></span><button className="text-button" onClick={() => onCompare(ply - 1, (record.comparisonBefore || record.before).pv.slice(0, 6))}>Explore alternative<ArrowUpRight size={13} /></button></div>}
    {record.type === 'brilliant' && <div className="brilliant-evidence"><Sparkles size={15} /><span>Linea sacrifice check · {record.brilliance.evaluation?.exact ? 'exact terminal result' : `acceptance search depth ${record.brilliance.depth}`} · independent heuristic</span></div>}
  </div>;
}

export function PersonalCoach({ game, review, onNavigate, onCompare, color, setColor }) {
  const summary = useMemo(() => coachingSummary(game, review.records, color), [game, review.records, color]);
  return <section className="personal-coach" aria-label="Personalized game coaching"><header><span className="coach-icon"><Lightbulb size={17} /></span><div><span className="eyebrow">YOUR GAME, YOUR NEXT STEP</span><h3>A little direction.</h3></div><label className="sr-only" htmlFor="coaching-side">Player to coach</label><select id="coaching-side" aria-label="Choose player for personalized coaching" value={color} onChange={event => setColor(event.target.value)}><option value="w">White</option><option value="b">Black</option></select></header>
    {summary ? <><h4>{summary.headline}</h4><p className="coach-strength"><span>What went well</span>{summary.strength}</p><p><span className="coach-label">Your focus</span>{summary.focus}</p><div className="coach-drill"><Target size={16} /><div><strong>One exercise for your next session</strong><p>{summary.drill}</p></div></div>
      {summary.critical.length > 0 && <div className="critical-moments"><span className="eyebrow">POSITIONS TO REVISIT</span>{summary.critical.map(({ move, record, ply }) => <div key={ply}><button className="critical-position" onClick={() => onNavigate(ply)}><span style={{ color: FEEDBACK[record.type].color }}><MoveIcon type={record.type} /></span><strong>{moveLabel(move)}</strong><span>{record.loss.toFixed(1)} pp lost</span><ChevronRight size={13} /></button><div className="critical-actions"><button onClick={() => onNavigate(ply - 1)}>Try the position first</button>{record.before.pv?.length > 0 && <button onClick={() => onCompare(ply - 1, record.before.pv.slice(0, 6))}>Compare engine line<ArrowUpRight size={11} /></button>}</div></div>)}</div>}
      {summary.brilliant.length > 0 && <div className="brilliant-moments"><span className="eyebrow">BRILLIANT SACRIFICES · LINEA</span>{summary.brilliant.map(({ move, ply }) => <button key={ply} onClick={() => onNavigate(ply)}><span>!!</span>{moveLabel(move)}<ArrowUpRight size={13} /></button>)}</div>}
      <small className="coach-note">Personalized to {summary.name}’s {summary.reviewed}/{summary.total} reviewed moves. On-device, rule-based guidance grounded in the engine lines—not an AI chat service or Chess.com coaching.</small>
    </> : <div className="coach-empty"><p>Review this game to build a coaching plan for {game.headers[color === 'w' ? 'White' : 'Black'] || (color === 'w' ? 'White' : 'Black')}. Switch sides to coach either player.</p><button className="button secondary full-width" disabled={!game.moves.length || review.running} onClick={review.start}><Sparkles size={14} />{review.running ? 'Review in progress…' : 'Start game review'}</button></div>}
  </section>;
}
