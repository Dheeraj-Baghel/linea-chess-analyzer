import { useRef } from 'react';
import { ArrowUpRight, Info, Upload } from 'lucide-react';
import { DEFAULT_POSITION } from './chess';
import ChessComImport from './ChessComImport';
import LichessImport from './LichessImport';

// Reused in the rail and accessible picker dialog, but rendered once at a time.
// All text, provider filters/results and request identity remain in App's store.
export default function ImportContent({ imports, compact = false, onOpenPicker }) {
  const { state, store, submitText } = imports, file = useRef(null);
  const tab = state.tab;
  return <div className={`import-workspace ${compact ? 'import-compact' : ''}`}>
    <div className="segmented wide" aria-label="Game import source">
      {[['chesscom', 'Chess.com'], ['lichess', 'Lichess'], ['pgn', 'PGN game']].map(([key, label]) => <button type="button" key={key} aria-pressed={tab === key} className={tab === key ? 'selected' : ''} onClick={() => store.setTab(key)}>{label}</button>)}
    </div>
    <button type="button" className={`text-button fen-action ${tab === 'fen' ? 'active' : ''}`} aria-pressed={tab === 'fen'} onClick={() => store.setTab('fen')}>FEN position</button>
    {tab === 'chesscom' ? <ChessComImport imports={imports} compact={compact} onOpenPicker={onOpenPicker} /> : tab === 'lichess' ? <LichessImport imports={imports} compact={compact} onOpenPicker={onOpenPicker} /> : <form onSubmit={event => { event.preventDefault(); submitText(tab); }}>
      <label className="field-label" htmlFor="import-text">{tab === 'pgn' ? 'Game notation' : 'Position notation'}</label>
      <textarea id="import-text" value={state[tab]} onChange={event => store.setText(tab, event.target.value)} rows={compact ? 3 : 7} spellCheck="false" placeholder={tab === 'pgn' ? '[White "Your name"]\n[Black "Your opponent"]\n\n1. e4 e5 2. Nf3 Nc6…' : DEFAULT_POSITION} />
      {tab === 'pgn' && <label className="field-label">Player to focus on<select aria-label="PGN player to focus on" value={state.focusColor} onChange={event => store.setFocusColor(event.target.value)}><option value="">Choose a player</option><option value="w">White</option><option value="b">Black</option></select></label>}
      {state.textErrors[tab] && <p className="form-error" role="alert">{state.textErrors[tab]}</p>}
      {!compact && <div className="import-note"><Info size={15} /><span>{tab === 'pgn' ? 'One game at a time. Original comments, variations and recorded clocks remain in PGN export.' : 'Position analysis only. Supply all six FEN fields; no completed-game report is invented.'}</span></div>}
      <div className="modal-actions">
        {tab === 'pgn' ? <><input ref={file} type="file" className="sr-only" tabIndex={-1} aria-label="Choose a PGN game file" accept=".pgn,.txt,application/x-chess-pgn,text/plain" onChange={event => { if (event.target.files?.[0]) store.readPgnFile(event.target.files[0]); }} /><button type="button" className="button secondary" onClick={() => file.current.click()}><Upload size={16} />Choose file</button></> : <button type="button" className="button secondary" onClick={() => store.setText('fen', DEFAULT_POSITION)}>Starting position</button>}
        <button type="submit" className="button primary">{tab === 'pgn' ? 'Load game' : 'Load position'}<ArrowUpRight size={16} /></button>
      </div>
    </form>}
  </div>;
}
