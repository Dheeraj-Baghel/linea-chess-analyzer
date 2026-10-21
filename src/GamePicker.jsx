import { ChevronRight } from 'lucide-react';
import { monthLabel } from './importState';

// Shared normalized picker. The rail never renders a squeezed result list.
// Selecting a row is the only provider action that can replace the current game.
export default function GamePicker({ provider, state, store, onSelect, loadedKey }) {
  if (!state.account && !state.games.length) return null;
  const filtered = state.games.filter(game => state.filter === 'all' || game.format === state.filter);
  const name = provider === 'chesscom' ? 'Chess.com' : 'Lichess';
  return <div className="archive-results">
    <div className="archive-filters">
      {state.account?.archives?.length > 0 && <label>Month<select value={state.month} aria-label={`${name} game archive month`} disabled={state.busy} onChange={event => store.changeMonth(provider, event.target.value)}>{state.account.archives.map(item => <option key={item.month} value={item.month}>{monthLabel(item.month)}</option>)}</select></label>}
      <label>Format<select value={state.filter} aria-label="Filter games by time format" onChange={event => store.patchProvider(provider, { filter: event.target.value, limit: 20 })}><option value="all">All formats</option>{['ultraBullet', 'bullet', 'blitz', 'rapid', 'classical', 'daily', 'correspondence'].map(format => <option key={format} value={format}>{format}</option>)}</select></label>
    </div>
    <div className="archive-count">{filtered.length} public standard {filtered.length === 1 ? 'game' : 'games'} · {state.account?.username || name}</div>
    <div className="archive-game-list" aria-label={`${name} games`}>
      {filtered.slice(0, state.limit).map(game => <button type="button" key={game.key} className="archive-game" data-game-id={game.id} data-provider={game.provider} disabled={loadedKey === game.key} onClick={() => onSelect(game)}>
        <span className="archive-result">{game.result}</span>
        <span className="archive-players"><strong>{game.white.name} <span>vs</span> {game.black.name}</strong><small>{game.provider} · White {game.white.rating ?? 'unrated'} / Black {game.black.rating ?? 'unrated'}</small><small>{game.format} · {game.timeControl} · {game.date ? new Date(game.date).toLocaleDateString() : 'Date not supplied'}{game.rated ? ' · Rated' : ''}{loadedKey === game.key ? ' · Already loaded' : ''}</small></span>
        <ChevronRight size={16} />
      </button>)}
      {!filtered.length && !state.busy && <p className="archive-empty">No completed standard games for this selection. Try another month or format.</p>}
    </div>
    {filtered.length > state.limit && <button type="button" className="button secondary full-width" onClick={() => store.patchProvider(provider, { limit: state.limit + 20 })}>Show 20 more games</button>}
    {state.hasMore && <button type="button" className="button secondary full-width" disabled={state.busy} onClick={() => store.loadMore(provider)}>Load older games</button>}
  </div>;
}
