import { useEffect, useState, useSyncExternalStore } from 'react';
import { chessComAdapter, createImportStore } from './importState';
import { lichessAdapter } from './lichess';
import { assertSinglePgn } from './singlePgn';

// App owns this hook exactly once. Presentations receive controlled state/actions.
export function useImports(onImport) {
  const [store] = useState(() => createImportStore({ chesscom: chessComAdapter, lichess: lichessAdapter }));
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  useEffect(() => () => store.dispose(), [store]);
  const submitText = kind => {
    const value = state[kind];
    if (!value.trim()) { store.setTextError(kind, `Paste a ${kind.toUpperCase()} first.`); return; }
    if (value.length > 2000000) { store.setTextError(kind, 'Please use a single game under 2 MB.'); return; }
    try {
      if (kind === 'pgn') { assertSinglePgn(value); if (!state.focusColor) throw new Error('Choose White or Black as the player to focus on for this PGN.'); }
      onImport(kind, value, kind === 'pgn' ? { color: state.focusColor, autoReview: true } : null); store.markLoaded(null);
    }
    catch (error) { store.setTextError(kind, error.message || 'The notation could not be read.'); }
  };
  const selectGame = row => {
    if (row.key === store.getSnapshot().loadedKey) return;
    const provider = row.provider === 'chess.com' ? 'chesscom' : row.provider;
    try {
      onImport('pgn', row.pgn, { provider: row.provider, id: row.id, url: row.url, username: row.username || null, color: row.color, autoReview: true });
      store.markLoaded(row.key);
    } catch (error) { store.patchProvider(provider, { error: `This game could not be loaded: ${error.message}` }); }
  };
  return { state, store, submitText, selectGame };
}
