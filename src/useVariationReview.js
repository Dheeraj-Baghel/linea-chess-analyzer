import { useEffect, useState, useSyncExternalStore } from 'react';
import { createVariationHandoff, createVariationReview, variationReviewKey } from './variationReview.js';

// App-owned, not tied to a visible panel: board badges and the phone feedback
// remain active even with the review panel hidden. Position analysis is still
// deliberate; explicitly requesting it pauses this automatic branch reviewer.
export function useVariationReview({ game, variation, variationPly, review, coordinator, active, enabled }) {
  const [session] = useState(() => createVariationReview({ createEngine: onPreempt => coordinator.createClient('variation', onPreempt) }));
  const [handoff] = useState(() => createVariationHandoff({ getSnapshot: review.getSnapshot, stop: review.stop, resume: review.resume }));
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [visible, setVisible] = useState(() => !document.hidden);
  const inBranch = Boolean(variation), quality = review.generation?.policy.id || review.selectedQuality;
  useEffect(() => {
    const visibility = () => {
      if (document.hidden) { session.pause('Move review paused while the tab is hidden.'); handoff.abandon(); }
      setVisible(!document.hidden);
    };
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, [session, handoff]);
  useEffect(() => {
    if (!active || !visible) { session.clear(); handoff.abandon(); return; }
    if (inBranch) handoff.enter(game.id);
    else { session.clear(); handoff.leave(game.id); }
  }, [game.id, inBranch, active, visible, review.running, review.generation?.id, session, handoff]);
  const getMainline = review.getSnapshot;
  useEffect(() => {
    if (!active || !visible || !variation) return;
    if (!enabled) { session.pause('Move review paused for position analysis.'); return; }
    session.setTarget({ game, variation, ply: variationPly, quality, mainline: getMainline() });
    return () => session.pause();
  }, [game, variation, variationPly, quality, active, enabled, visible, session, getMainline]);
  useEffect(() => () => { handoff.abandon(); session.dispose(); }, [session, handoff]);
  // Reject the previous position's result DURING render, before effect cleanup.
  const key = variationReviewKey(game, variation, variationPly, quality);
  const current = key && snapshot.key === key ? snapshot : { key, record: null, records: {}, evaluation: null, error: '', status: !enabled ? 'paused' : variationPly ? 'thinking' : 'idle', stage: !enabled ? 'Move review paused for position analysis.' : variationPly ? 'Analyzing this move...' : 'Play an alternate move to review it.' };
  return { ...current, quality, retry: session.retry };
}
