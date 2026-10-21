import { useEffect, useState } from 'react';
import { canDetectOpening, detectOpening, loadOpeningIndex, suppliedOpening, unavailableOpening } from './openings';

export function useOpening(game) {
  const [resolved, setResolved] = useState(null);
  const supplied = suppliedOpening(game);
  useEffect(() => {
    if (suppliedOpening(game) || !canDetectOpening(game)) return;
    let current = true;
    loadOpeningIndex().then(index => {
      if (current) setResolved({ id: game.id, opening: detectOpening(game, index) });
    }).catch(() => { if (current) setResolved({ id: game.id, opening: unavailableOpening('Local dataset could not load; board analysis is unaffected') }); });
    return () => { current = false; };
  }, [game]);
  if (supplied) return supplied;
  if (!canDetectOpening(game)) return unavailableOpening('No standard-start recorded line');
  return resolved?.id === game.id ? resolved.opening : { name: 'Identifying opening…', eco: null, source: 'loading', sourceLabel: 'Local lookup · board remains usable', matchedPly: null };
}
