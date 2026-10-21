import { useMemo } from 'react';
import { Check, Cpu, FileText, Pause, Play, RefreshCw, Sparkles } from 'lucide-react';
import { advantage, FEEDBACK, moveLabel, pvToSan, scoreText } from './chess';
import { IconButton } from './UI';
import { ENGINE_BUILD } from './engineBuild';
import MoveIcon from './MoveIcon';

export function FeedbackBadge({ record, text = false }) {
  if (!record) return <span className="unreviewed" title="Not yet reviewed" aria-label="Not yet reviewed">·</span>;
  const feedback = FEEDBACK[record.type];
  return <span className={`feedback-badge feedback-${record.type}`} style={{ '--feedback-color': feedback.color }} title={`${feedback.label}. ${feedback.description}`}><span className="feedback-icon" aria-hidden="true"><MoveIcon type={record.type} size={text ? 18 : 16} /></span>{text && <span>{feedback.label}</span>}<span className="sr-only">{!text && feedback.label}</span></span>;
}

export function ReviewControl({ game, review }) {
  return <button className={`text-button ${review.running ? 'review-running' : ''}`} onClick={review.running ? review.stop : review.start} disabled={!game.moves.length || review.done === game.moves.length && !review.running && !review.hasPendingSettings}>
    {review.running ? <Pause size={14} /> : review.done === game.moves.length && game.moves.length ? <Check size={14} /> : <Sparkles size={14} />}
    {review.running ? `${review.done}/${game.moves.length} · Pause` : review.hasPendingSettings ? `Review with ${review.selectedPolicy.label}` : review.done === game.moves.length && game.moves.length ? 'Reviewed' : review.canResume ? 'Resume review' : 'Review game'}
  </button>;
}

export function PanelTabs({ active, setActive, game, includeEngine = false }) {
  const tabs = [['moves', 'Moves', FileText], ...(includeEngine ? [['engine', 'Engine', Cpu]] : []), ['report', 'Report', Sparkles]];
  return <div className="panel-tabs" role="tablist" aria-label="Game analysis panels">{tabs.map(([key, label, Icon], index) => <button key={key} id={`${key}-tab`} role="tab" aria-selected={active === key} tabIndex={active === key ? 0 : -1} className={active === key ? 'selected' : ''} onClick={() => setActive(key)} onKeyDown={event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const target = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    setActive(tabs[target][0]); event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[target].focus();
  }}><Icon size={16} />{label}{key === 'moves' && <span className="tab-count">{game.moves.length}</span>}</button>)}</div>;
}

// The engine instance and jobs remain App-owned, regardless of rail/drawer/tab.
export function EnginePanel({ engine, fen, enabled, setEnabled, count, setCount, depth, setDepth, bestArrow, setBestArrow, multiArrows, setMultiArrows, onExplore }) {
  const first = engine.data?.lines?.[0];
  const lines = useMemo(() => (engine.data?.lines || []).map(line => ({ ...line, moves: pvToSan(fen, line.pv) })), [engine.data, fen]);
  const status = engine.status === 'loading' ? 'Loading locally' : engine.status === 'thinking' ? 'Analyzing' : engine.status === 'paused' ? 'Paused' : engine.status === 'error' ? 'Unavailable' : 'Search complete';
  return <section className="engine-card card" aria-label="Local position engine">
    <header className="engine-header"><div className="engine-identity"><span className="engine-icon"><Cpu size={19} /></span><div><h3 title={`Stockfish.js ${ENGINE_BUILD.version} · ${ENGINE_BUILD.variant} · one thread`}>{ENGINE_BUILD.name}<span>LOCAL ENGINE</span></h3><span className={`engine-status ${engine.status}`}><i />{status}</span></div></div><IconButton icon={enabled ? Pause : Play} label={enabled ? 'Pause position analysis' : 'Resume position analysis'} active={!enabled} onClick={() => setEnabled(!enabled)} /></header>
    <div className="engine-evaluation"><div><strong>{scoreText(first)}</strong><span>{advantage(first)}</span></div><span className="depth-label">Depth <b>{first?.depth ?? '—'}</b><span>/ {depth}</span></span></div>
    <progress className={`depth-progress ${engine.status === 'thinking' ? 'thinking' : ''}`} max={depth} value={Math.min(depth, first?.depth || 0)} aria-label={`Analysis depth ${first?.depth || 0} of target ${depth}`} />
    <div className="engine-controls"><label>Lines<select aria-label="Number of candidate lines" value={count} onChange={event => setCount(Number(event.target.value))}><option value={1}>1 line</option><option value={2}>2 lines</option><option value={3}>3 lines</option></select></label><label>Position depth<select aria-label="Target analysis depth" value={depth} onChange={event => setDepth(Number(event.target.value))}><option value={12}>12 · Quick</option><option value={16}>16 · Balanced</option><option value={20}>20 · Deeper</option></select></label></div>
    <div className="candidate-lines">
      {lines.length ? lines.map((line, index) => <div className={`candidate-line ${index === 0 ? 'principal' : ''}`} key={line.rank}><div className="candidate-meta"><span className={`candidate-number candidate-${index}`}>{index + 1}</span><strong>{scoreText(line)}</strong><span>depth {line.depth}</span>{index === 0 && <span className="best-label">BEST LINE</span>}</div><div className="pv-moves">{line.moves.length ? line.moves.map((move, i) => <button key={`${i}-${move.uci}`} title={`Explore this continuation through ${moveLabel(move)}`} aria-label={`Explore line ${index + 1} through ${moveLabel(move)}`} onClick={() => onExplore(line.pv.slice(0, i + 1))}>{(move.color === 'w' || i === 0) && <span>{move.number}{move.color === 'w' ? '.' : '…'}</span>}{move.san}</button>) : <span className="subtle-note">No legal continuation.</span>}</div></div>) : <div className="engine-empty"><span className={`engine-orbit ${engine.status === 'thinking' || engine.status === 'loading' ? 'working' : ''}`}><Sparkles size={20} /></span><p>{engine.status === 'paused' ? 'A moment to think for yourself.' : engine.status === 'error' ? 'The board is still yours to explore.' : 'Looking for the next good idea.'}</p><span>{engine.status === 'paused' ? 'Resume whenever you’re ready.' : 'Analysis never blocks your next move.'}</span></div>}
    </div>
    {engine.error && <div className="engine-error" role="alert"><p>{engine.error}</p><button className="text-button" onClick={engine.retry}><RefreshCw size={14} />Retry engine</button></div>}
    <div className="arrow-options"><label><input type="checkbox" checked={bestArrow} onChange={event => setBestArrow(event.target.checked)} /><span className="dashed-icon" />Best-move arrow</label><label><input type="checkbox" checked={multiArrows} onChange={event => { setMultiArrows(event.target.checked); if (event.target.checked && count === 1) setCount(3); }} />Candidates</label></div>
    <footer className="engine-footer"><span><i className="privacy-dot" />On-device analysis</span><span title="Every engine score is from White’s perspective, regardless of the board orientation.">+ White / − Black</span></footer>
  </section>;
}
