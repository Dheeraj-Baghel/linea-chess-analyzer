import { useMemo } from 'react';
import { Chess } from 'chess.js';
import { FEEDBACK, VALUES } from './chess';
import { accuracySummary } from './accuracy';
import { experimentalGameRatings } from './gameRating';
import { ReviewChart } from './ReportPanel';
import MoveIcon from './MoveIcon';

// Chess.com-style overview card (user-supplied reference, 21 Oct 2026):
// eval graph -> players -> accuracy -> per-side classification table -> game rating
// -> phase ratings -> Start review. All numbers come from Linea's own local review;
// unreviewed/unavailable values stay explicit ("—"), never invented.
const ROWS = ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder', 'forced'];
const percent = value => value === null || value === undefined ? '—' : value.toFixed(1);

// Phase split: first 20 plies = opening; endgame once non-pawn, non-king material
// (both sides) is <= 26 points (e.g. queens off + a few pieces). Otherwise middlegame.
function phaseOf(game, index) {
  if (index < 20) return 'opening';
  const board = new Chess(game.moves[index].before).board().flat();
  const material = board.reduce((sum, piece) => sum + (piece && piece.type !== 'p' ? VALUES[piece.type] : 0), 0);
  return material <= 26 ? 'endgame' : 'middlegame';
}
// Map a phase accuracy to the nearest classification icon, as a visual summary only.
function phaseIcon(value) {
  if (value === null) return null;
  return value >= 90 ? 'best' : value >= 80 ? 'excellent' : value >= 68 ? 'good' : value >= 55 ? 'inaccuracy' : value >= 40 ? 'mistake' : 'blunder';
}

function PlayerName({ game, color }) {
  const name = game.headers[color === 'w' ? 'White' : 'Black'] || (color === 'w' ? 'White' : 'Black');
  const elo = game.headers[color === 'w' ? 'WhiteElo' : 'BlackElo'];
  return <div className="ov-player"><span className={`ov-avatar ${color === 'w' ? 'white' : 'black'}`} aria-hidden="true"><img src={`/pieces/cburnett/${color}k.svg`} alt="" /></span><span className="ov-name" title={name}>{name}</span>{elo && <small>{elo}</small>}</div>;
}

export default function ReviewOverview({ game, review, ply, onNavigate, onJump, coachColor, setCoachColor, onStart }) {
  const summary = useMemo(() => accuracySummary(game, review.records, review.generation?.id), [game, review.records, review.generation?.id]);
  const ratings = useMemo(() => experimentalGameRatings(game, review), [game, review]);
  const counts = useMemo(() => {
    const result = Object.fromEntries(ROWS.map(type => [type, { w: [], b: [] }]));
    game.moves.forEach((move, index) => { const record = review.records[index + 1]; if (record && result[record.type]) result[record.type][move.color].push(index + 1); });
    return result;
  }, [game, review.records]);
  const phases = useMemo(() => {
    const result = { opening: { w: [], b: [] }, middlegame: { w: [], b: [] }, endgame: { w: [], b: [] } };
    for (const side of ['w', 'b']) for (const entry of summary[side].entries) result[phaseOf(game, entry.ply - 1)][side].push(entry.accuracy);
    return Object.fromEntries(Object.entries(result).map(([phase, sides]) => [phase, Object.fromEntries(Object.entries(sides).map(([side, values]) => [side, values.length ? values.reduce((a, b) => a + b, 0) / values.length : null]))]));
  }, [game, summary]);
  const jump = (plies) => { if (!plies.length) return; onJump((plies.find(value => value > ply) || plies[0])); };
  const status = review.running ? review.stage || `Reviewing ${summary.reviewed}/${summary.total}…` : summary.complete ? 'Full game reviewed' : summary.reviewed ? `Partial review · ${summary.reviewed}/${summary.total} plies${summary.provisional ? ` · ${summary.provisional} provisional` : ''}` : 'Awaiting review evidence';
  return <section className="review-overview" aria-label="Game review overview">
    <ReviewChart game={game} review={review} ply={ply} onNavigate={onNavigate} />
    <div className="ov-grid ov-players"><span className="ov-label">Players</span><PlayerName game={game} color="w" /><PlayerName game={game} color="b" /></div>
    <div className="ov-grid ov-accuracy accuracy-summary compact" aria-label="Linea estimated game accuracy">
      <span className="ov-label">Accuracy <abbr title="Independent Linea engine estimate, not Chess.com's score.">est.</abbr></span>
      {['w', 'b'].map(color => { const side = summary[color]; return <div className={`accuracy-player ov-acc ${color === 'w' ? 'white' : 'black'}`} key={color}><strong>{percent(side.accuracy)}</strong><small>{side.reviewed} / {side.total} moves{side.complete ? ' · complete' : side.reviewed ? ' · partial' : ' · awaiting review'}</small></div>; })}
    </div>
    <p className="ov-status" role="status">{status}</p>
    <div className="ov-table" aria-label="Move classifications by player">
      {ROWS.map(type => { const feedback = FEEDBACK[type]; return <div className="ov-row" key={type} style={{ '--tone': feedback.color }}>
        <span className="ov-type" title={feedback.description}>{feedback.label}</span>
        <button className="ov-count" disabled={!counts[type].w.length} onClick={() => jump(counts[type].w)} aria-label={`White ${feedback.label}: ${counts[type].w.length}`}>{counts[type].w.length}</button>
        <span className="ov-icon" aria-hidden="true"><MoveIcon type={type} size={24} /></span>
        <button className="ov-count" disabled={!counts[type].b.length} onClick={() => jump(counts[type].b)} aria-label={`Black ${feedback.label}: ${counts[type].b.length}`}>{counts[type].b.length}</button>
      </div>; })}
    </div>
    <div className="ov-grid ov-rating"><span className="ov-label">Game rating <abbr title="Experimental, uncalibrated heuristic. Not an account rating.">exp.</abbr></span>{['w', 'b'].map(color => <strong key={color} className={`ov-box ${color === 'w' ? 'white' : 'black'}`} title={ratings[color].reason || `${ratings[color].mode}; ${ratings[color].decisions} decisions`}>{ratings[color].value ?? '—'}</strong>)}</div>
    {['opening', 'middlegame', 'endgame'].map(phase => <div className="ov-grid ov-phase" key={phase}><span className="ov-label">{phase[0].toUpperCase() + phase.slice(1)}</span>{['w', 'b'].map(color => { const value = phases[phase][color], icon = phaseIcon(value); return <span key={color} className="ov-phase-icon" title={value === null ? 'No reviewed moves in this phase' : `${value.toFixed(1)}% average move accuracy`} style={icon ? { '--tone': 'transparent' } : undefined}>{icon ? <MoveIcon type={icon} size={28} /> : '—'}</span>; })}</div>)}
    <label className="focus-player">Focus player<select aria-label="Focus player" value={coachColor} onChange={event => setCoachColor(event.target.value)}><option value="w">{game.headers.White || 'White'} · White</option><option value="b">{game.headers.Black || 'Black'} · Black</option></select></label>
    <button className="button primary full-width start-review" disabled={!summary.reviewed} onClick={onStart}>{summary.complete ? 'Start review' : summary.reviewed ? 'Explore partial review' : review.running ? 'Analysis in progress…' : 'Awaiting review evidence'}</button>
  </section>;
}
