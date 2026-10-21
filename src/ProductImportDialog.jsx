import { useState } from 'react';
import { Modal } from './UI';
import ImportContent from './ImportContent';
import { normalizeUsername } from './chesscom';
import { normalizeLichessUsername } from './lichess';

export default function ProductImportDialog({ imports, onBrowse, onClose }) {
  const source = imports.state.productSource, username = imports.state.productUsername;
  const setSource = value => imports.store.setProductDraft({ productSource: value }), setUsername = value => imports.store.setProductDraft({ productUsername: value });
  const [error, setError] = useState('');
  const provider = source === 'lichess' ? 'Lichess' : 'Chess.com';
  return <Modal title="Bring your games." subtitle="Public games, your own analysis. No login or ownership verification." onClose={onClose} className="import-modal">
    <div className="import-source-cards">{[['chesscom', 'Chess.com'], ['lichess', 'Lichess'], ['pgn', 'PGN game'], ['secondary', 'Game link / FEN']].map(([key, label]) => <button key={key} aria-pressed={source === key} className={source === key ? 'chosen' : ''} onClick={() => { setSource(key); setError(''); if (key === 'pgn') imports.store.setTab('pgn'); }}>{label}</button>)}</div>
    {['chesscom', 'lichess'].includes(source) ? <form onSubmit={event => { event.preventDefault(); try { const name = source === 'chesscom' ? normalizeUsername(username) : normalizeLichessUsername(username); onBrowse(source, name); } catch (reason) { setError(reason.message); } }}><label className="field-label" htmlFor="provider-username">{provider} username</label><input id="provider-username" autoComplete="off" value={username} onChange={event => setUsername(event.target.value)} placeholder={source === 'lichess' ? 'lichess.org username' : 'Chess.com username'} /><p className="subtle-note">Find the latest 10 eligible Rapid, Blitz and Bullet games. Fewer than 10 is fine. Requests can be cancelled; an animation never substitutes for real progress.</p>{error && <p role="alert" className="form-error">{error}</p>}<div className="modal-actions"><button className="button primary" type="submit">Find recent games</button></div></form> : <ImportContent imports={imports} />}
  </Modal>;
}
