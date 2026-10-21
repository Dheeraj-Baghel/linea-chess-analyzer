import { Globe, Info, LoaderCircle, Search } from 'lucide-react';
import GamePicker from './GamePicker';

// Pure presentation: ownership and active requests live above all surfaces.
export default function ChessComImport({ imports, compact = false, onOpenPicker }) {
  const { state: owner, store, selectGame } = imports;
  const state = owner.providers.chesscom;
  const patch = values => store.patchProvider('chesscom', values);
  const search = event => { event.preventDefault(); store.search('chesscom'); if (compact) onOpenPicker(); };
  return <div className="chesscom-import">
    {!compact && <div className="import-source-heading"><span className="chesscom-symbol"><Globe size={18} /></span><div><strong>Your games. A fresh perspective.</strong><p>Public completed games · no sign-in needed</p></div></div>}
    <div className="import-mode-buttons">
      <button type="button" aria-pressed={state.mode === 'username'} className={state.mode === 'username' ? 'selected' : ''} onClick={() => patch({ mode: 'username' })}>By username</button>
      <button type="button" aria-pressed={state.mode === 'url'} className={state.mode === 'url' ? 'selected' : ''} onClick={() => patch({ mode: 'url' })}>By game link</button>
    </div>
    <form onSubmit={search}>
      {state.mode === 'url' && <><label className="field-label" htmlFor="chesscom-url">Chess.com game URL</label><input id="chesscom-url" className="text-input" type="url" required value={state.url} onChange={event => patch({ url: event.target.value })} placeholder="https://www.chess.com/game/live/…" autoComplete="off" /></>}
      <label className="field-label" htmlFor="chesscom-user">{state.mode === 'username' ? 'Chess.com username' : 'Either player’s username (if needed)'}</label>
      <div className="import-search-row"><input id="chesscom-user" className="text-input" required={state.mode === 'username'} value={state.username} onChange={event => patch({ username: event.target.value })} placeholder="Your username" autoCapitalize="none" spellCheck="false" autoComplete="off" maxLength={30} /><button type="submit" className="button primary" disabled={state.busy}>{state.busy ? <LoaderCircle size={15} className="spin" /> : <Search size={15} />}{state.mode === 'username' ? 'Find games' : 'Find game'}</button></div>
      {state.mode === 'url' && <div className="link-month-field"><label className="field-label" htmlFor="chesscom-link-month">Game month (optional, useful for older games)</label><input id="chesscom-link-month" className="text-input" type="month" value={state.linkMonth} onChange={event => patch({ linkMonth: event.target.value })} /></div>}
    </form>
    {state.busy && <div className="import-progress" role="status"><LoaderCircle size={14} className="spin" /><span>{state.message}</span><button type="button" onClick={() => store.cancel('chesscom')}>Cancel</button></div>}
    {state.error && <p className="form-error" role="alert">{state.error}</p>}
    {compact ? state.games.length > 0 && <button className="text-button" onClick={onOpenPicker}>Choose from {state.games.length} games</button> : <GamePicker provider="chesscom" state={state} store={store} onSelect={selectGame} loadedKey={owner.loadedKey} />}
    {!compact && <><div className="import-note"><Info size={15} /><span>Public standard games only. Exact-ID link search checks up to 18 archive months unless you specify one. Some links need a player’s username. Closing or switching this view preserves the search; use Cancel to stop it.</span></div><p className="subtle-note">Choose a game to load it and start local review. Linea’s estimates are independent, not Chess.com scores. No late search result replaces your game automatically.</p></>}
  </div>;
}
