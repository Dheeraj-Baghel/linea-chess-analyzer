import { useEffect, useMemo, useRef, useState } from 'react';
import { FEEDBACK, moveLabel } from './chess';
import { accuracySummary } from './accuracy';
import { AccuracySummary, MoveCoaching, PersonalCoach } from './ReviewInsights';
import { ReviewQuality, ReviewProvenance, ReviewBreakdown, MoveReviewEvidence } from './ReviewDetails';
import { ReviewControl, FeedbackBadge } from './Panels';
import { ReviewChart } from './ReportPanel';
import ReviewOverview from './ReviewOverview';

function Notation({ game, review, ply, onNavigate, scrollRef, follow }) {
  const active = useRef(null);
  const rows = useMemo(() => {
    const result = [];
    game.moves.forEach((move, index) => { let row = result.at(-1); if (!row || row.number !== move.number) { row = { number: move.number }; result.push(row); } row[move.color] = { ...move, ply: index + 1 }; }); return result;
  }, [game]);
  useEffect(() => {
    const target = active.current, container = scrollRef.current;
    if (!target || !container || !follow) return;
    const a = target.getBoundingClientRect(), b = container.getBoundingClientRect();
    if (a.top < b.top || a.bottom > b.bottom) container.scrollTop += a.top - b.top - (b.height - a.height) / 2;
  }, [ply, scrollRef, follow]);
  return <div className="compact-notation" aria-label="Recorded game moves"><button className="starting-position" onClick={() => onNavigate(0)}>Starting position <span>0</span></button>{rows.map(row => <div className="move-row" key={row.number}><span className="move-number">{row.number}.</span>{['w', 'b'].map(color => { const move = row[color]; return move ? <button key={color} ref={move.ply === ply ? active : null} className={`move-entry ${move.ply === ply ? 'current' : ''}`} aria-current={move.ply === ply ? 'step' : undefined} aria-label={`Go to ${moveLabel(move)}${review.records[move.ply] ? `, ${FEEDBACK[review.records[move.ply].type].label}` : ''}`} onClick={() => onNavigate(move.ply)}><span>{move.san}</span><FeedbackBadge record={review.records[move.ply]} text /></button> : <span key={color} />; })}</div>)}</div>;
}

export default function ReviewWorkspacePanel({ game, review, ply, variation, variationPly, onVariationNavigate, onReturn, onNavigate, onCompare, onContinue, coachColor, setCoachColor, guided, onStart, onOverview, engineElement, onlyMistakes, setOnlyMistakes, playing, togglePlayback, preferredTab, onTab, opening }) {
  const [tabState, setTabState] = useState('summary'), scroll = useRef(null);
  const tab = preferredTab === 'moves' ? 'moves' : preferredTab === 'summary' ? 'summary' : tabState;
  const setTab = value => { setTabState(value); onTab?.(value); };
  const summary = accuracySummary(game, review.records, review.generation?.id), record = review.records[ply];
  const entries = game.moves.flatMap((move, index) => move.color === coachColor && review.records[index + 1] ? [{ ply: index + 1, move, record: review.records[index + 1] }] : []);
  const moments = entries.filter(entry => entry.record.loss > 3 || entry.record.type === 'brilliant').map(entry => entry.ply);
  const sequence = onlyMistakes ? entries.filter(entry => entry.record.loss > 3).map(entry => entry.ply) : game.moves.map((_, index) => index + 1);
  const next = sequence.find(index => index > ply), previous = sequence.filter(index => index < ply).at(-1), nextMoment = moments.find(index => index > ply);
  const setTabFocus = (event, value) => { setTab(value); event.currentTarget.parentElement.querySelector(`[data-tab=${value}]`)?.focus(); };
  return <aside className="review-panel" aria-label="Game review panel">
    <header className="review-panel-heading"><div><span className="eyebrow">LINEA REVIEW</span><h2>{guided ? 'One move at a time.' : 'Game Review'}</h2></div><ReviewControl game={game} review={review} /></header>
    <div className="review-panel-body" ref={scroll}>
      {!game.moves.length ? <section className="product-empty"><h3>Position analysis</h3><p>This FEN has no recorded game to score. Make legal moves and expand Advanced analysis to explore it.</p></section> : <>
        {!guided && <ReviewOverview game={game} review={review} ply={variation ? variation.basePly : ply} onNavigate={onNavigate} onJump={target => { onStart(); onNavigate(target); }} coachColor={coachColor} setCoachColor={setCoachColor} onStart={onStart} />}
        {guided && <section className="guided-review" aria-label="Guided game review">
          <div className="guided-top"><button className="text-button" onClick={onOverview}>← Back to overview</button><span>{ply} / {game.moves.length}</span></div>
          <label className="focus-player">Focus player<select aria-label="Focus player" value={coachColor} onChange={event => setCoachColor(event.target.value)}><option value="w">{game.headers.White || 'White'} · White</option><option value="b">{game.headers.Black || 'Black'} · Black</option></select></label>
          <ReviewChart game={game} review={review} ply={variation ? variation.basePly : ply} onNavigate={onNavigate} />
          <p className="chart-caption">Recorded mainline evaluation · White’s perspective</p>
          <div className="guided-controls"><button className="button secondary" disabled={previous === undefined} onClick={() => onNavigate(previous)}>Previous</button><button className="button secondary" onClick={togglePlayback}>{playing ? 'Pause playback' : 'Play review'}</button><button className="button primary" disabled={next === undefined} onClick={() => onNavigate(next)}>Next</button></div>
          <label className="mistake-filter"><input type="checkbox" checked={onlyMistakes} onChange={event => { setOnlyMistakes(event.target.checked); if (event.target.checked) { const first = entries.find(entry => entry.record.loss > 3); if (first) onNavigate(first.ply); } }} />Review focused player’s mistakes only</label>
          {onlyMistakes && !sequence.length && <p role="status">No reviewed mistakes in this sample for this player.</p>}
          <div className="commentary-box">{variation ? <><h3>Exploring another move</h3><p>Original game and review evidence are unchanged. Return to the game to continue guided review.</p></> : record ? <MoveCoaching game={game} ply={ply} record={record} onCompare={onCompare} /> : <><h3>{ply ? moveLabel(game.moves[ply - 1]) : 'Starting position'}</h3><p>{ply ? 'This move is awaiting engine evidence. Replay and legal exploration remain available.' : 'Select a move on the graph or continue at your own pace.'}</p></>}</div>
          <div className="guided-actions"><button className="text-button" disabled={!record?.after.pv?.length || Boolean(variation)} onClick={() => onContinue(record.after.pv.slice(0, 6))}>Show continuation</button><button className="text-button" disabled={nextMoment === undefined} onClick={() => onNavigate(nextMoment)}>Next key moment →</button></div>
          {!variation && <MoveReviewEvidence record={record} />}
        </section>}
        <div className="review-view-tabs" role="tablist" aria-label="Review content"><button role="tab" data-tab="summary" id="summary-tab" aria-controls="review-summary" aria-selected={tab === 'summary'} tabIndex={tab === 'summary' ? 0 : -1} onClick={() => setTab('summary')} onKeyDown={event => { if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); setTabFocus(event, 'moves'); } }}>Summary</button><button role="tab" data-tab="moves" id="moves-tab" aria-controls="recorded-moves" aria-selected={tab === 'moves'} tabIndex={tab === 'moves' ? 0 : -1} onClick={() => setTab('moves')} onKeyDown={event => { if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); setTabFocus(event, 'summary'); } }}>Moves</button></div>
        <section id="review-summary" role="tabpanel" aria-labelledby="summary-tab" hidden={tab !== 'summary'}><p className="review-stage" role="status">{review.running ? review.stage : `${review.done} / ${game.moves.length} plies processed${summary.provisional ? ` · ${summary.provisional} provisional` : ''}`}</p><details><summary>Compare White and Black classifications</summary><ReviewBreakdown game={game} review={review} /></details></section>
        <section id="recorded-moves" role="tabpanel" aria-labelledby="moves-tab" hidden={tab !== 'moves'}><p className="subtle-note">Original notation · click any move to replay it.</p>{tab === 'moves' && <Notation game={game} review={review} ply={variation ? variation.basePly : ply} onNavigate={onNavigate} scrollRef={scroll} follow />}</section>
        {tab === 'summary' && <Notation game={game} review={review} ply={variation ? variation.basePly : ply} onNavigate={onNavigate} scrollRef={scroll} follow={false} />}
        {review.error && <p role="alert" className="inline-error">{review.error}</p>}
        {review.canResume && <button className="button secondary full-width" onClick={review.resume}>Continue game review</button>}
      </>}
      {variation && <section className="variation-strip"><button className="text-button" onClick={onReturn}>Return to game</button><div className="variation-moves"><button onClick={() => onVariationNavigate(0)}>↳ Start</button>{variation.moves.map((move, index) => <button key={index} aria-current={variationPly === index + 1 ? 'step' : undefined} onClick={() => onVariationNavigate(index + 1)}>{moveLabel(move)}</button>)}</div></section>}
      {opening}
      <details className="advanced-review"><summary>Advanced analysis & evidence</summary>{engineElement}<ReviewQuality game={game} review={review} /><ReviewProvenance review={review} />{game.moves.length > 0 && <><AccuracySummary game={game} review={review} detailsOnly /><PersonalCoach game={game} review={review} color={coachColor} setColor={setCoachColor} onNavigate={onNavigate} onCompare={onCompare} /></>}</details>
    </div>
  </aside>;
}
