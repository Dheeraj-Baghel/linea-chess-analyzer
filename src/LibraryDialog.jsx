import { useState } from 'react';
import { Trash2, FolderOpen } from 'lucide-react';
import { Modal } from './UI';

export default function LibraryDialog({ local, offlineNotice, onClose }) {
  const [confirm, setConfirm] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const remove = async () => {
    setBusy(true);
    try { setError(''); if (confirm === 'all') await local.clear(); else await local.remove(confirm); setConfirm(null); }
    catch (reason) { setError(reason.message); }
    finally { setBusy(false); }
  };
  return <Modal title="Recent local games" subtitle="Saved on this device, in this browser only. No login or cloud sync." onClose={onClose} className="import-modal">
    <p className="subtle-note">Browser settings can clear these saves. Keep a PGN or review-evidence export for a portable copy. Display preferences are separate.</p>
    <p role="status" className="subtle-note">{offlineNotice}</p>
    {local.error && <p role="alert" className="inline-error">{local.error}</p>}
    {error && <p role="alert" className="inline-error">{error}</p>}
    {local.notice && <p role="status" className="subtle-note">{local.notice}</p>}
    <div className="local-game-list" aria-label="Saved Linea games">
      {local.games.map(game => <div className="local-game-row" key={game.key}>
        <button className="archive-game" onClick={() => local.openSaved(game.key)}><FolderOpen size={18} /><span className="sr-only">Open saved </span><span className="archive-players"><strong>{game.players.w} <span>vs</span> {game.players.b}</strong><small>{game.kind === 'position' ? 'Position only' : `${game.plies} plies · ${game.result}`} · {game.source?.provider || 'PGN/FEN'}</small><small>Opened {new Date(game.lastOpenedAt).toLocaleString()}</small></span></button>
        <button className="icon-button" aria-label={`Delete saved ${game.players.w} versus ${game.players.b}`} onClick={() => setConfirm(game.key)}><Trash2 size={17} /></button>
      </div>)}
      {!local.games.length && <p className="archive-empty">{local.status === 'loading' ? 'Loading local library…' : local.error ? 'Local saves could not be read. Your open board is unchanged.' : 'No games saved yet. Import a game or position to keep it here.'}</p>}
    </div>
    {confirm && <section className="local-delete-confirm" aria-label="Confirm local deletion"><p>{confirm === 'all' ? 'Delete all Linea games, reviews, selections and reports from this browser?' : 'Delete this game and its saved reviews and dependent reports?'}</p><p className="subtle-note">The open board stays in memory; new saves for the deleted copy stop. This cannot be undone.</p><div className="modal-actions"><button className="button secondary" disabled={busy} onClick={() => setConfirm(null)}>Keep saves</button><button className="button primary" disabled={busy} onClick={remove}>{busy ? 'Deleting…' : 'Delete local data'}</button></div></section>}
    <div className="modal-actions"><button className="button secondary" onClick={() => local.retry()}>Retry local storage</button><button className="button secondary" disabled={busy} onClick={() => setConfirm('all')}>Clear Linea local data</button></div>
  </Modal>;
}
