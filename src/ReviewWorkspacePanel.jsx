import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Lightbulb, Pause, Play, Sparkles } from 'lucide-react';
import { FEEDBACK, moveLabel, scoreText } from './chess';
import { accuracySummary, moveExplanation, phasePerformance, GAME_PHASES } from './review';
import { experimentalGameRatings } from './gameRating';
import { ReviewControl } from './Panels';
import { ReviewChart } from './ReportPanel';
import { MoveReviewEvidence } from './ReviewDetails';
import MoveIcon from './MoveIcon';
import VariationReviewCard from './VariationReviewCard';
import ExplanationPlayback, { ExplanationFacts, ExplanationUncertainty } from './ExplanationPlayback';

// Right-hand review panel (user mockups, 22 Oct 2026). Two distinct modes:
//  1. Overview: heading + status, players, accuracy, per-side classification counts,
//     estimated game rating, three game phases, full-width Start Game Review. Nothing else.
//  2. Guided review: active move card (Explain / Next), interactive move table with
//     evaluations, compact evaluation graph and a transport bar.
// Both modes only READ the existing review snapshot; switching never re-runs Stockfish.
// Engine, review quality, evidence, coaching and opening live in the Analysis tools dialog.
const ROWS = ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder'];
const percent = value => Number.isFinite(value) ? value.toFixed(1) : '—';
const name = (game, color) => game.headers[color === 'w' ? 'White' : 'Black'] || (color === 'w' ? 'White' : 'Black');
const accepted = (review, ply) => { const record = review.records[ply]; return record && (!review.generation?.id || record.provenance?.generationId === review.generation.id) ? record : null; };

function Player({ game, color }) {
  const elo = game.headers[color === 'w' ? 'WhiteElo' : 'BlackElo'];
  return <div className="ov-player">
    <span className={`ov-avatar ${color === 'w' ? 'white' : 'black'}`} aria-hidden="true"><img src={`/pieces/cburnett/${color}k.svg`} alt="" /></span>
    <span className="ov-player-text"><strong className="ov-name" title={name(game, color)}>{name(game, color)}</strong><small>{elo && /^\d+$/.test(elo) ? <>{elo}<br /></> : null}{color === 'w' ? 'White' : 'Black'}</small></span>
  </div>;
}

function Overview({ game, review, onStart, onJump, onNavigate, ply }) {
  const generationId = review.generation?.id;
  const summary = useMemo(() => accuracySummary(game, review.records, generationId), [game, review.records, generationId]);
  const ratings = useMemo(() => experimentalGameRatings(game, review), [game, review]);
  const phases = useMemo(() => phasePerformance(game, review.records, generationId), [game, review.records, generationId]);
  const plies = useMemo(() => {
    const result = Object.fromEntries(ROWS.map(type => [type, { w: [], b: [] }]));
    game.moves.forEach((move, index) => { const record = accepted(review, index + 1); if (record && result[record.type]) result[record.type][move.color].push(index + 1); });
    return result;
  }, [game, review]);
  return <>
    <div className="gr-body ov-body" role="region" aria-label="Game review overview">
      <div className="ov-side-head" aria-hidden="true"><span>{name(game, 'w')}</span><span>Move quality</span><span>{name(game, 'b')}</span></div>
      <div className="ov-table" role="table" aria-label="Move classifications by player">
        {ROWS.filter(type => FEEDBACK[type]).map(type => { const feedback = FEEDBACK[type], w = plies[type].w, b = plies[type].b; return <div className="ov-row" role="row" key={type} style={{ '--tone': feedback.color }}>
          <span role="cell"><button className="ov-count" disabled={!w.length} onClick={() => onJump(w)} aria-label={`White ${feedback.label}: ${w.length}`}>{w.length}</button></span>
          <span className="ov-type" role="cell" title={feedback.description}><MoveIcon type={type} size={18} /><span>{feedback.label}</span></span>
          <span role="cell"><button className="ov-count" disabled={!b.length} onClick={() => onJump(b)} aria-label={`Black ${feedback.label}: ${b.length}`}>{b.length}</button></span>
        </div>; })}
      </div>
      <div className="ov-metrics" role="group" aria-label="Accuracy and estimated game rating">
        <div className="ov-metric-row"><span>{percent(summary.w.accuracy)}</span><strong>Accuracy</strong><span>{percent(summary.b.accuracy)}</span></div>
        <div className="ov-metric-row"><span>{ratings.w.value ?? '—'}</span><strong>Estimated rating</strong><span>{ratings.b.value ?? '—'}</span></div>
      </div>
      <div className="ov-phase-quality" role="table" aria-label="Opening, middlegame and endgame quality">
        {GAME_PHASES.map(phase => <div className="ov-phase-row" role="row" key={phase}>
          <span role="cell">{phases[phase].w.type ? <MoveIcon type={phases[phase].w.type} size={18} /> : '—'}</span>
          <strong role="rowheader">{phase[0].toUpperCase() + phase.slice(1)}</strong>
          <span role="cell">{phases[phase].b.type ? <MoveIcon type={phases[phase].b.type} size={18} /> : '—'}</span>
        </div>)}
      </div>
      <div className="ov-overview-chart"><ReviewChart game={game} review={review} ply={ply} onNavigate={onNavigate} /></div>
      {review.error && <p role="alert" className="inline-error">{review.error}</p>}
    </div>
    <footer className="gr-footer"><button className="button primary full-width start-review" onClick={onStart}><Play size={18} fill="currentColor" />Start Game Review</button></footer>
  </>;
}

function MoveTable({ game, review, ply, onNavigate }) {
  const active = useRef(null), container = useRef(null);
  const rows = useMemo(() => {
    const result = [];
    game.moves.forEach((move, index) => { let row = result.at(-1); if (!row || row.number !== move.number) { row = { number: move.number }; result.push(row); } row[move.color] = { ...move, ply: index + 1 }; });
    return result;
  }, [game]);
  useEffect(() => {
    const target = active.current, box = container.current;
    if (!target || !box) return;
    const a = target.getBoundingClientRect(), b = box.getBoundingClientRect();
    if (a.top < b.top + 28 || a.bottom > b.bottom) box.scrollTop += a.top - b.top - (b.height - a.height) / 2;
  }, [ply]);
  const current = accepted(review, ply);
  const cell = move => {
    if (!move) return <span className="gr-move empty" role="cell" />;
    const record = accepted(review, move.ply), feedback = record && FEEDBACK[record.type];
    return <span role="cell" className="gr-cell"><button className={`gr-move move-entry ${move.ply === ply ? 'current' : ''}`} style={feedback ? { '--tone': feedback.color } : undefined} aria-current={move.ply === ply ? 'step' : undefined} aria-label={`Go to ${moveLabel(move)}${feedback ? `, ${feedback.label}` : ''}`} onClick={() => onNavigate(move.ply)}>
      <span className="gr-move-icon">{record && <MoveIcon type={record.type} size={16} />}</span><span className="gr-san">{move.san}</span>
    </button></span>;
  };
  return <div className="gr-moves" ref={container} role="table" aria-label="Recorded game moves">
    <div className="gr-moves-head" role="row"><span role="columnheader">#</span><span role="columnheader">White</span><span role="columnheader">Black</span><span role="columnheader">Eval</span></div>
    {rows.map(row => { const last = row.b || row.w, record = last && accepted(review, last.ply), here = [row.w?.ply, row.b?.ply].includes(ply);
      return <div className={`gr-row ${here ? 'current-row' : ''}`} role="row" key={row.number} ref={here ? active : null} style={here && current ? { '--row-tone': FEEDBACK[current.type].color } : undefined}>
        <span className="gr-num" role="cell">{row.number}</span>{cell(row.w)}{cell(row.b)}<span className="gr-eval" role="cell">{record ? scoreText(record.after) : ''}</span>
      </div>; })}
  </div>;
}

function Guided({ game, review, ply, variation, variationPly, variationReview, onShowWhy, onRetryVariation, onVariationNavigate, onReturn, onNavigate, onCompare, onContinue, playing, togglePlayback }) {
  const [explain, setExplain] = useState(false);
  const shown = variation ? variation.basePly : ply, total = game.moves.length;
  const record = !variation && accepted(review, ply), move = game.moves[ply - 1];
  const generationId = review.generation?.id, gameSignature = review.generation?.game.signature;
  const explanation = useMemo(() => record ? moveExplanation(move, record, { game, ply, generationId, gameSignature }) : null, [move, record, game, ply, generationId, gameSignature]);
  const feedback = record ? FEEDBACK[record.type] : null;
  const current = variation ? variationPly : ply, limit = variation ? variation.moves.length : total;
  const go = target => (variation ? onVariationNavigate : onNavigate)(Math.max(0, Math.min(limit, target)));
  return <>
    <div className="gr-body guided-review" role="region" aria-label="Guided game review">
      {variation ? <VariationReviewCard game={game} variation={variation} variationPly={variationPly} variationReview={variationReview} onShowWhy={onShowWhy} onVariationNavigate={onVariationNavigate} onReturn={onReturn} onRetryVariation={onRetryVariation} onContinue={onContinue} /> : <section className={`gr-card commentary-box ${feedback ? 'has-feedback' : ''}`} style={feedback ? { '--tone': feedback.color } : undefined} aria-live="polite">
          <div className="gr-card-head">
            {record ? <span className="gr-card-icon"><MoveIcon type={record.type} size={40} /></span> : <span className="gr-card-icon empty" aria-hidden="true" />}
            <div><h3 style={feedback ? { color: feedback.color } : undefined}>{feedback ? feedback.label : ply ? 'Awaiting review' : 'Starting position'}</h3><p className="gr-move-label">{ply ? moveLabel(move) : 'Before the first move'}</p></div>
            {record && <strong className="gr-eval-box" title="Engine evaluation after this move, White's perspective">{scoreText(record.after)}</strong>}
          </div>
          <p className="gr-text">{explanation ? explanation.body : ply ? 'This move has no engine evidence yet. Run the game review to classify it.' : 'Press Next to step through the game move by move.'}</p>
          <ExplanationUncertainty explanation={explanation} />
          {explanation && <button className="text-button show-why-button" onClick={() => onShowWhy(explanation)}><Play size={14} />Show why</button>}
          {explain && explanation && <div className="gr-explain">
            <ExplanationFacts explanation={explanation} />
            <div className="move-coach-metrics"><span>Evaluation <b>{explanation.before} → {explanation.after}</b></span><span>Move accuracy <b>{Number.isFinite(explanation.accuracy) ? `${explanation.accuracy.toFixed(1)}%` : '—'}</b></span></div>
            {explanation.alternative && <div className="better-continuation"><span>Engine preferred: <strong>{explanation.alternatives.slice(0, 6).map(moveLabel).join(' ')}</strong></span><button className="text-button" onClick={() => onCompare(ply - 1, explanation.alternatives.slice(0, 6).map(move => move.uci))}>Explore alternative<ArrowUpRight size={13} /></button></div>}
            {record.type === 'brilliant' && <p className="brilliant-evidence"><Sparkles size={14} />Linea sacrifice check · independent heuristic</p>}
            <MoveReviewEvidence record={record} />
          </div>}
          <div className="gr-actions">
            <button className="button secondary" aria-expanded={explain} disabled={!explanation} onClick={() => setExplain(value => !value)}><Lightbulb size={16} />{explain ? 'Hide' : 'Explain'}</button>
            <button className="button primary" disabled={ply >= total} onClick={() => go(ply + 1)}><Play size={15} fill="currentColor" />Next</button>
          </div>
      </section>}
      {total > 0 && <><MoveTable game={game} review={review} ply={shown} onNavigate={onNavigate} />
      <div className="gr-chart"><ReviewChart game={game} review={review} ply={shown} onNavigate={onNavigate} /></div></>}
    </div>
    <footer className="gr-footer gr-transport" aria-label="Review navigation">
      <button className="icon-button" aria-label="Review: first position" disabled={!current} onClick={() => go(0)}><ChevronFirst size={20} /></button>
      <button className="icon-button" aria-label="Review: previous move" disabled={!current} onClick={() => go(current - 1)}><ChevronLeft size={20} /></button>
      <button className="icon-button gr-play" aria-label={playing ? 'Review: pause playback' : variation ? 'Review: play variation' : 'Review: play game'} disabled={!limit} onClick={togglePlayback}>{playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}</button>
      <button className="icon-button" aria-label="Review: next move" disabled={current >= limit} onClick={() => go(current + 1)}><ChevronRight size={20} /></button>
      <button className="icon-button" aria-label="Review: last position" disabled={current >= limit} onClick={() => go(limit)}><ChevronLast size={20} /></button>
    </footer>
  </>;
}

export default function ReviewWorkspacePanel(props) {
  const { game, review, ply, variation, variationPly, illustration, onCompareIllustration, onFollowIllustration, onBackToReview, onIllustrationNavigate, onReplayIllustration, guided, onStart, onOverview, onNavigate, onVariationNavigate, onReturn } = props;
  const shown = variation ? variation.basePly : ply, total = game.moves.length;
  const current = variation ? variationPly : ply, limit = variation ? variation.moves.length : total;
  const navigate = variation ? onVariationNavigate : onNavigate;
  const jump = plies => { if (!plies.length) return; onStart(); onNavigate(plies.find(value => value > shown) || plies[0]); };
  return <aside className={`review-panel ${guided ? 'mode-guided' : 'mode-overview'}`} aria-label="Game review panel">
    <header className="review-panel-heading">
      {illustration ? <>
        <div className="gr-head-top"><button className="branch-return-button" onClick={onBackToReview}><ArrowLeft size={14} />Back to review</button><span className="eyebrow">STORED EVIDENCE</span></div>
        <div className="gr-head-main"><h2>Why this move?</h2></div>
      </> : guided ? <>
        {/* Single compact return action belongs in the RIGHT review panel,
            per the user's corrected preference; no banner or board action. */}
        <div className="gr-head-top">{variation ? <button type="button" className="branch-return-button" onClick={onReturn} title={`Return to ${moveLabel(game.moves[variation.basePly - 1])}`}><ArrowLeft size={14} aria-hidden="true" /><span>Return to game</span></button> : <button className="text-button gr-back" onClick={onOverview}><ArrowLeft size={14} />Back to Overview</button>}<span className="eyebrow">LINEA REVIEW</span></div>
        <div className="gr-head-main"><h2>{variation ? 'Move Review' : 'Game Review'}</h2><div className="gr-stepper"><button className="icon-button" aria-label="Previous move in review" disabled={!current} onClick={() => navigate(current - 1)}><ChevronLeft size={16} /></button><span>{current} / {limit}</span><button className="icon-button" aria-label="Next move in review" disabled={current >= limit} onClick={() => navigate(current + 1)}><ChevronRight size={16} /></button></div></div>
      </> : <div className="gr-head-main"><div><span className="eyebrow">LINEA REVIEW</span><h2>Game Review</h2></div><span className="review-status"><ReviewControl game={game} review={review} /></span></div>}
    </header>
    {illustration ? <div className="gr-body guided-review"><ExplanationPlayback illustration={illustration} playing={props.playing} onNavigate={onIllustrationNavigate} onToggle={props.togglePlayback} onCompare={onCompareIllustration} onFollow={onFollowIllustration} onReplay={onReplayIllustration} /></div> : !total && !variation ? <div className="gr-body"><section className="product-empty"><h3>Position analysis</h3><p>This FEN has no recorded game to review. Make legal moves on the board, or open Analysis tools for the engine.</p></section></div>
      : guided ? <Guided {...props} /> : <Overview game={game} review={review} ply={ply} onNavigate={onNavigate} onStart={onStart} onJump={jump} />}
  </aside>;
}
