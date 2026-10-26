import { Activity, Lightbulb, Pause, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import { FEEDBACK, moveLabel, scoreText } from './chess';
import { AccuracySummary, MoveCoaching, PersonalCoach } from './ReviewInsights';
import { IconButton } from './UI';
import MoveIcon from './MoveIcon';
import { MoveReviewEvidence, ReviewBreakdown, ReviewProvenance, ReviewQuality } from './ReviewDetails';

// Chess.com-style evaluation chart: White's advantage is the filled area from the bottom
// (Linea yellow instead of Chess.com white); the cursor takes the current move's colour.
const chartY = point => 50 - Math.tanh((Number.isFinite(point.cp) ? point.cp : point.mate > 0 ? 1000 : point.mate < 0 ? -1000 : 0) / 400) * 40;
export function ReviewChart({ game, review, ply, onNavigate }) {
  const [hovered, setHovered] = useState(null);
  const records = Object.entries(review.records).sort(([a], [b]) => Number(a) - Number(b));
  const points = records.length ? [{ ply: 0, ...records[0][1].before }, ...records.map(([index, record]) => ({ ply: Number(index), type: record.type, ...record.after }))] : [];
  const total = Math.max(game.moves.length, 1);
  const coordinates = points.map(point => `${point.ply / total * 600},${chartY(point)}`).join(' ');
  const current = review.records[ply], cursor = current ? FEEDBACK[current.type].color : 'var(--chart-cursor)';
  const shown = hovered;
  return <div className="review-chart interactive-review-chart" aria-label="Game evaluation chart. Positive scores favor White." onMouseLeave={() => setHovered(null)}>
    <svg viewBox="0 0 600 100" preserveAspectRatio="none" aria-hidden="true">
      {points.length > 0 && <><polyline className="chart-line" points={coordinates} /><polygon className="chart-white-area" points={`0,100 ${coordinates} ${points.at(-1).ply / total * 600},100`} fill="var(--action)" /></>}
      <line x1={ply / total * 600} y1="0" x2={ply / total * 600} y2="100" stroke={cursor} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    <line x1="0" y1="50" x2="600" y2="50" stroke="var(--chart-grid)" strokeDasharray="5 5" vectorEffect="non-scaling-stroke" />
    </svg>
    {!points.length && <span className="chart-empty">Review the game to plot its evaluation.</span>}
    {shown && shown.ply > 0 && <div className="chart-tooltip" style={{ left: `${Math.max(16, Math.min(84, shown.ply / total * 100))}%` }}><strong>{moveLabel(game.moves[shown.ply - 1])}</strong><span>{scoreText(shown)}{shown.type ? ` · ${FEEDBACK[shown.type].label}` : ''}</span></div>}
    {points.map(point => <span key={point.ply} className="chart-point" style={{ left: `${point.ply / total * 100}%`, width: `${Math.max(2, 100 / total)}%` }} onMouseEnter={() => setHovered(point)} />)}
  </div>;
}

export default function ReportPanel({ game, review, ply, variation, onNavigate, onCompare, coachColor, setCoachColor, onClose }) {
  const record = !variation && review.records[ply], move = game.moves[ply - 1];
  const tally = Object.values(review.records).reduce((out, item) => ({ ...out, [item.type]: (out[item.type] || 0) + 1 }), {});
  return <section className="report-content" id="report-panel" role="tabpanel" aria-label="Game report">
    <header className="report-heading"><div><span className="eyebrow">LINEA REVIEW</span><h3>Game report</h3></div><IconButton icon={X} label="Close game report" onClick={onClose} /></header>
    {!game.moves.length ? <div className="empty-moves"><Activity size={24} /><strong>Position analysis only</strong><p>This position has no recorded game to score. The local engine still analyzes your board; import a PGN for a game report.</p></div> : <div className="insights-content">
      <AccuracySummary game={game} review={review} />
      <ReviewQuality game={game} review={review} />
      <ReviewProvenance review={review} />
      <ReviewChart game={game} review={review} ply={variation ? variation.basePly : ply} onNavigate={onNavigate} />
      <div className="chart-caption"><span>White’s perspective</span><span>{review.done} / {game.moves.length} plies reviewed</span></div>
      <div className="review-stats">{[['best', 'Sound moves', Object.values(review.records).filter(item => Number.isFinite(item.loss) && item.loss <= 3).length], ['inaccuracy', 'Inaccuracies', tally.inaccuracy || 0], ['mistake', 'Mistakes / misses', (tally.mistake || 0) + (tally.miss || 0)], ['blunder', 'Blunders', tally.blunder || 0]].map(([type, label, count]) => <div key={type}><span><MoveIcon type={type} /></span><strong>{count}</strong><small>{label}</small></div>)}</div>
      <ReviewBreakdown game={game} review={review} />
      <div className="commentary-box"><span className="eyebrow"><Lightbulb size={13} />AT THIS POSITION</span>
        {variation ? <><h4>Exploring a variation</h4><p>The engine follows your branch. The original game and report remain unchanged.</p></> : record ? <MoveCoaching game={game} ply={ply} record={record} onCompare={onCompare} /> : <><h4>{ply === 0 ? 'Starting position' : `A closer look at ${moveLabel(move)}.`}</h4><p>Review the game for move feedback. You can explore the board while it runs.</p></>}
        {!variation && move?.comment && <blockquote>{move.comment}</blockquote>}
        {!variation && <MoveReviewEvidence record={record} />}
      </div>
      {review.error && <p role="alert" className="inline-error">{review.error}</p>}
      <PersonalCoach game={game} review={review} onNavigate={onNavigate} onCompare={onCompare} color={coachColor} setColor={setCoachColor} />
      <p className="review-disclaimer">Linea’s independent estimates, not provider ratings. Sound moves have no more than 3 estimated percentage points of chance loss, regardless of label. Game review and position depth are separate. The displayed generation records its policy, actual reached depths and coverage; deeper searches can change judgments.</p>
    </div>}
  </section>;
}
