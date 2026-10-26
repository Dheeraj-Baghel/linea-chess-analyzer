import { useState } from 'react';
import { ArrowRight, FileText, Link2, Lock, ShieldCheck, Zap } from 'lucide-react';
import { Modal } from './UI';
import ImportContent from './ImportContent';
import { normalizeUsername } from './chesscom';
import { normalizeLichessUsername } from './lichess';

// "Review my game" import popup, restyled to the user's 22 Oct 2026 mockup:
// 2x2 source cards with icons + sublabels, prefixed username field, full-width
// yellow submit and a three-point trust footer. Accessible names of source buttons,
// the username label and the submit button are unchanged (existing tests rely on them).
const SOURCES = [
  ['chesscom', 'Chess.com', 'Public games', 'chesscom'],
  ['lichess', 'Lichess', 'Public games', 'lichess'],
  ['pgn', 'PGN game', 'Paste or upload', 'pgn'],
  ['secondary', 'Game link / FEN', 'Single game or position', 'link'],
];
function SourceIcon({ kind }) {
  if (kind === 'chesscom') return <span className="src-icon chesscom" aria-hidden="true"><img src="/icons/sources/chesscom.png" alt="" width="20" height="30" decoding="async" /></span>;
  if (kind === 'lichess') return <span className="src-icon lichess" aria-hidden="true"><img src="/icons/sources/lichess.png" alt="" width="38" height="38" decoding="async" /></span>;
  if (kind === 'pgn') return <span className="src-icon" aria-hidden="true"><FileText size={20} /></span>;
  return <span className="src-icon" aria-hidden="true"><Link2 size={20} /></span>;
}

export default function ProductImportDialog({ imports, onBrowse, onClose }) {
  const source = imports.state.productSource, username = imports.state.productUsername;
  const setSource = value => imports.store.setProductDraft({ productSource: value }), setUsername = value => imports.store.setProductDraft({ productUsername: value });
  const [error, setError] = useState('');
  const provider = source === 'lichess' ? 'Lichess' : 'Chess.com';
  return <Modal title="Bring your games." subtitle="Import your games and get insights from your own analysis." onClose={onClose} className="import-modal import-modal-v2">
    <div className="import-source-cards" role="group" aria-label="Import source">{SOURCES.map(([key, label, sub, icon]) => <button type="button" key={key} aria-pressed={source === key} className={source === key ? 'chosen' : ''} onClick={() => { setSource(key); setError(''); if (key === 'pgn') imports.store.setTab('pgn'); }}><SourceIcon kind={icon} /><span className="src-text"><strong>{label}</strong><small aria-hidden="true">{sub}</small></span>{source === key && <span className="src-check" aria-hidden="true">✓</span>}</button>)}</div>
    {['chesscom', 'lichess'].includes(source) ? <form className="import-username-form" onSubmit={event => { event.preventDefault(); try { const name = source === 'chesscom' ? normalizeUsername(username) : normalizeLichessUsername(username); onBrowse(source, name); } catch (reason) { setError(reason.message); } }}>
      <label className="field-label" htmlFor="provider-username">{provider} username</label>
      <div className="prefixed-input"><span aria-hidden="true">@</span><input id="provider-username" autoComplete="off" value={username} onChange={event => setUsername(event.target.value)} placeholder={source === 'lichess' ? 'Enter your Lichess username' : 'Enter your Chess.com username'} /></div>
      <p className="subtle-note">We’ll find your latest 10 eligible Rapid, Blitz and Bullet games. Fewer than 10 is fine.</p>
      {error && <p role="alert" className="form-error">{error}</p>}
      <button className="button primary import-submit" type="submit"><span>Find recent games</span><ArrowRight size={18} aria-hidden="true" /></button>
    </form> : <ImportContent imports={imports} />}
    <ul className="import-trust" aria-label="Privacy">
      <li><Lock size={16} aria-hidden="true" /><span><strong>No login</strong><small>You stay in control</small></span></li>
      <li><ShieldCheck size={16} aria-hidden="true" /><span><strong>Private</strong><small>Your data stays in this browser</small></span></li>
      <li><Zap size={16} aria-hidden="true" /><span><strong>Runs locally</strong><small>Analysis on your device</small></span></li>
    </ul>
  </Modal>;
}
