import { useMemo, useState } from 'react';
import { Lightbulb, Play, RefreshCw } from 'lucide-react';
import { FEEDBACK, moveLabel, scoreText } from './chess.js';
import { moveExplanation } from './review.js';
import { REVIEW_POLICIES } from './reviewPolicy.js';
import { MoveReviewEvidence } from './ReviewDetails.jsx';
import MoveIcon from './MoveIcon.jsx';
import { ExplanationFacts, ExplanationUncertainty } from './ExplanationPlayback.jsx';

const labelFor = (review, ply) => review.record ? FEEDBACK[review.record.type].label : !ply ? 'Branch starting point' : review.status === 'error' ? 'Move review unavailable' : review.status === 'paused' ? 'Move review paused' : 'Analyzing this move...';

// An inline part of the normal review, not a modal or a replacement for the
// original game. Pending/unavailable searches never receive a made-up label.
export default function VariationReviewCard({ game, variation, variationPly, variationReview: review, onShowWhy, onVariationNavigate, onRetryVariation }) {
  const [explain, setExplain] = useState(false);
  const move = variation.moves[variationPly - 1], record = review.record;
  const feedback = record && FEEDBACK[record.type];
  const explanation = useMemo(() => moveExplanation(move, record, { game, variation, variationPly }), [move, record, game, variation, variationPly]);
  return <section className="gr-card commentary-box variation-review-card" role="region" aria-label="Live variation move review" data-review-status={review.status} data-branch-ply={variationPly} style={feedback ? { '--tone': feedback.color } : undefined}>
    <p className="variation-review-context">LIVE EXPLORATION <span>{REVIEW_POLICIES[review.quality].label}</span></p>
    <div className="gr-card-head" aria-live="polite" aria-atomic="true">
      <span className={`gr-card-icon ${record ? '' : 'empty'}`}>{record && <MoveIcon type={record.type} size={40} />}</span>
      <div><h3 data-feedback-type={record?.type} style={feedback ? { color: feedback.color } : undefined}>{labelFor(review, variationPly)}</h3><p className="gr-move-label">{move ? moveLabel(move) : moveLabel(game.moves[variation.basePly - 1])}{record?.provisional && <span className="variation-provisional">Provisional</span>}</p></div>
      {record && <strong className="gr-eval-box" title="Evaluation after this branch move, White's perspective">{scoreText(record.after)}</strong>}
    </div>
    <p className="gr-text">{explanation ? explanation.body : review.error || review.stage}</p>
    <ExplanationUncertainty explanation={explanation} />
    {explanation && <button className="text-button show-why-button" onClick={() => onShowWhy(explanation)}><Play size={14} />Show why</button>}
    {record && <button className="text-button variation-explain-toggle" aria-expanded={explain} onClick={() => setExplain(value => !value)}><Lightbulb size={15} />{explain ? 'Hide move explanation' : 'Explain this move'}</button>}
    {explain && explanation && <div className="gr-explain">
      <ExplanationFacts explanation={explanation} />
      <div className="move-coach-metrics"><span>Evaluation <b>{explanation.before} → {explanation.after}</b></span><span>Move accuracy <b>{Number.isFinite(explanation.accuracy) ? `${explanation.accuracy.toFixed(1)}%` : '—'}</b></span></div>
      {explanation.alternative && <p>Engine preferred: <strong>{explanation.alternatives.map(moveLabel).join(' ')}</strong></p>}
      <MoveReviewEvidence record={record} />
    </div>}
    {['error', 'paused'].includes(review.status) && <button className="button secondary variation-retry" onClick={onRetryVariation}><RefreshCw size={15} />{review.status === 'error' ? 'Retry move review' : 'Resume move review'}</button>}
    <div className="variation-strip">
      <div className="variation-moves" aria-label="Exploration moves"><button aria-current={!variationPly ? 'step' : undefined} onClick={() => onVariationNavigate(0)}>↳ Start</button>{variation.moves.map((item, index) => {
        const result = review.records[index + 1];
        return <button key={`${index}-${item.uci}`} aria-current={variationPly === index + 1 ? 'step' : undefined} aria-label={`Explore ${moveLabel(item)}${result ? `, ${FEEDBACK[result.type].label}` : ', not yet reviewed'}`} onClick={() => onVariationNavigate(index + 1)}>{result && <MoveIcon type={result.type} size={16} />}{moveLabel(item)}</button>;
      })}</div>
    </div>
    <p className="variation-isolation-note">Original game, accuracy and review evidence are unchanged. Return to the branch point to continue.</p>
  </section>;
}

// Phones and focus view keep the live judgment beside the board, not behind a tab.
export function VariationFeedbackSummary({ review, ply, onDetails, onRetry }) {
  const feedback = review.record && FEEDBACK[review.record.type];
  return <div className="variation-feedback-summary" role="region" aria-label="Variation move feedback">
    <div aria-live="polite" aria-atomic="true">{feedback && <MoveIcon type={review.record.type} size={22} />}<span><strong data-feedback-type={review.record?.type} style={feedback ? { color: feedback.color } : undefined}>{labelFor(review, ply)}</strong><small>{review.record ? `${scoreText(review.record.after)} · ${review.record.provisional ? 'Provisional · ' : ''}Branch move only` : review.error || review.stage}</small></span></div>
    {['error', 'paused'].includes(review.status) ? <button className="text-button" onClick={onRetry}>{review.status === 'error' ? 'Retry' : 'Resume'}</button> : <button className="text-button" onClick={onDetails}>Details</button>}
  </div>;
}
