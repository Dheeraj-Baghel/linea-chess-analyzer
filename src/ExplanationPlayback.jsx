import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from 'lucide-react';
import { FEEDBACK, moveLabel } from './chess.js';
import MoveIcon from './MoveIcon.jsx';

export function ExplanationFacts({ explanation }) {
  return <>
    <ul className="explanation-facts" aria-label="Facts supporting this explanation">{explanation.facts.map(fact => <li key={fact.id} data-fact-kind={fact.kind} data-fact-source={fact.source} data-evidence-level={fact.level || 'observable'} data-supports-summary={explanation.supportingFactIds.includes(fact.id)}><small className="explanation-evidence-level">{{ observable: 'Observable fact', consequence: 'Supported consequence', comparative: 'Comparative evidence' }[fact.level] || 'Observable fact'}</small><span>{fact.text}</span><small>{fact.source === 'board-rules' ? 'Verified on the board / move history' : fact.source === 'legal-replies-and-engine-line' ? 'Legal check replies + bounded recapture check + stored line' : fact.source === 'same-root-comparison' ? 'Immediate consequence compared at the same historical root' : fact.source === 'same-root-position-difference' ? 'Observable candidate difference; not a causal verdict' : 'Stored calculated line, not established as the reason for this move'}</small></li>)}</ul>
    <details className="explanation-search-limits"><summary>Search limits and interpretation</summary><p className="subtle-note">{explanation.limitations}</p></details>
    {explanation.warnings.map(text => <p key={text} className="subtle-note">{text}</p>)}
  </>;
}

export function ExplanationUncertainty({ explanation }) {
  return explanation?.provisional ? <p className="explanation-uncertainty" role="status">Provisional evidence: the comparison is not stable enough for a firm conclusion.</p> : null;
}

// Same component in the right panel and the phone board: the reason remains
// visible as moves play, rather than disappearing into an anonymous branch.
export default function ExplanationPlayback({ illustration, playing, onNavigate, onToggle, onReplay, onCompare, onFollow, compact = false, onDetails, onBack }) {
  const { explanation, line, step, sourceRecord } = illustration;
  const feedback = FEEDBACK[sourceRecord.type];
  const next = line[step];
  const nextRole = next?.color === explanation.move.color ? 'mover continuation' : "opponent's suggested reply";
  return <section tabIndex={-1} className={`gr-card commentary-box explanation-playback ${compact ? 'explanation-compact' : ''}`} role="region" aria-label={compact ? 'Engine illustration on board' : 'Engine illustration'} data-illustration-step={step} data-explanation-version={explanation.version}>
    <p className="variation-review-context">ILLUSTRATIVE ENGINE LINE <span>Not the recorded game</span></p>
    <div className="explanation-origin"><MoveIcon type={sourceRecord.type} size={24} /><strong>Reviewed move: {explanation.title}</strong><span style={{ color: feedback.color }}>{feedback.label}</span></div>
    <p className="gr-text explanation-summary">{compact ? explanation.reason : explanation.body}</p>
    <ExplanationUncertainty explanation={explanation} />
    {illustration.alternativeLine?.length > 0 && <div className="illustration-comparison" aria-label="Compare stored continuations"><button aria-pressed={illustration.lineMode !== 'alternative'} onClick={() => onCompare('played')}>Played move</button><button aria-pressed={illustration.lineMode === 'alternative'} onClick={() => onCompare('alternative')}>Preferred alternative</button></div>}
    <p className="illustration-view-label">{illustration.lineMode === 'alternative' ? step === 0 ? `Preferred alternative: ${line[0].san} · same before-position` : `Alternative continuation · next ${nextRole}${next ? `: ${next.san}` : ': line ends here'}` : illustration.view === 'continuation' ? `Played continuation · next ${nextRole}${next ? `: ${next.san}` : ': line ends here'}` : step === 0 ? 'Played move · arrow from its before-position' : 'Selected move idea · highlights show supporting pieces/squares'}</p>
    <p className="explanation-step" aria-live="polite" aria-atomic="true">{step ? `Showing ${moveLabel(line[step - 1])}` : 'Before the reviewed move'} · {step} / {line.length}</p>
    {!compact && <div className="illustration-line" aria-label="Illustration moves"><button aria-current={!step ? 'step' : undefined} onClick={() => onNavigate(0)}>Start</button>{line.map((move, index) => <button key={`${index}-${move.uci}`} aria-current={step === index + 1 ? 'step' : undefined} aria-label={`Illustration: ${moveLabel(move)}`} onClick={() => onNavigate(index + 1)}>{moveLabel(move)}</button>)}</div>}
    <div className="illustration-controls" aria-label="Engine illustration playback">
      <button className="icon-button" aria-label="Illustration: previous move" disabled={!step} onClick={() => onNavigate(step - 1)}><ChevronLeft size={18} /></button>
      <button className="button secondary" onClick={onToggle} aria-label={playing ? 'Pause illustration' : 'Play illustration'}>{playing ? <Pause size={16} /> : <Play size={16} />}{playing ? 'Pause' : 'Play'}</button>
      <button className="icon-button" aria-label="Illustration: next move" disabled={step >= line.length} onClick={() => onNavigate(step + 1)}><ChevronRight size={18} /></button>
      <button className="text-button" onClick={onReplay}><RotateCcw size={15} />Replay</button>
    </div>
    {illustration.lineMode !== 'alternative' && illustration.view === 'idea' && step === 1 && line.length > 1 && <button className="text-button illustration-details" onClick={onFollow}>Follow continuation</button>}
    {compact ? <div className="illustration-controls"><button className="branch-return-button" onClick={onBack}>Back to review</button><button className="text-button illustration-details" onClick={onDetails}>Supporting facts</button></div> : <>
      <p className="subtle-note illustration-disclaimer">{explanation.disclaimer} Before-position arrows distinguish the played move from the preferred alternative; reply arrows appear only in the continuation/comparison view.</p>
      <details className="illustration-facts"><summary>Supporting facts</summary><ExplanationFacts explanation={explanation} /></details>
    </>}
  </section>;
}
