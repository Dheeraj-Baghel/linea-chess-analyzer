import { Globe, LoaderCircle, Search } from 'lucide-react';
import GamePicker from './GamePicker';

export default function LichessImport({ imports, compact = false, onOpenPicker }) {
  const { state: owner, store, selectGame } = imports, state = owner.providers.lichess;
  const patch = values => store.patchProvider('lichess', values);
  return <div className="lichess-import">
    {!compact && <div className="import-source-heading"><span className="chesscom-symbol"><Globe size={18} /></span><div><strong>Public Lichess games</strong><p>Completed standard games · no login or token</p></div></div>}
    <div className="import-mode-buttons"><button type="button" className={state.mode === 'username' ? 'selected' : ''} aria-pressed={state.mode === 'username'} onClick={() => patch({ mode: 'username' })}>By username</button><button type="button" className={state.mode === 'url' ? 'selected' : ''} aria-pressed={state.mode === 'url'} onClick={() => patch({ mode: 'url' })}>By game link</button></div>
    <form onSubmit={event => { event.preventDefault(); store.search('lichess'); if (compact) onOpenPicker(); }}>
      <label className="field-label" htmlFor={state.mode === 'username' ? 'lichess-user' : 'lichess-url'}>{state.mode === 'username' ? 'Lichess username' : 'Public Lichess game link or ID'}</label>
      <div className="import-search-row"><input id={state.mode === 'username' ? 'lichess-user' : 'lichess-url'} className="text-input" required value={state.mode === 'username' ? state.username : state.url} onChange={event => patch({ [state.mode === 'username' ? 'username' : 'url']: event.target.value })} placeholder={state.mode === 'username' ? 'Your username' : 'https://lichess.org/abcdefgh'} autoCapitalize="none" autoComplete="off" spellCheck="false" /><button type="submit" className="button primary" disabled={state.busy}>{state.busy ? <LoaderCircle size={15} className="spin" /> : <Search size={15} />}{state.mode === 'username' ? 'Find games' : 'Find game'}</button></div>
    </form>
    {state.busy && <div className="import-progress" role="status"><LoaderCircle className="spin" size={14} /><span>{state.message}</span><button type="button" onClick={() => store.cancel('lichess')}>Cancel</button></div>}
    {state.error && <p className="form-error" role="alert">{state.error}</p>}
    {state.notice && <p className="subtle-note" role="status">{state.notice}</p>}
    {compact ? state.games.length > 0 && <button className="text-button" onClick={onOpenPicker}>Choose from {state.games.length} games</button> : <GamePicker provider="lichess" state={state} store={store} onSelect={selectGame} loadedKey={owner.loadedKey} />}
    {!compact && <p className="subtle-note">Loads at most 20 games per request. Use Load older games for another bounded batch. Closing this view keeps drafts and requests; Cancel stops them. Choose a game to load its original PGN and begin local review. No Lichess credentials or provider evaluations are used.</p>}
  </div>;
}
