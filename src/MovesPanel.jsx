import { useEffect, useMemo, useRef } from 'react';
import { ChevronRight, Target } from 'lucide-react';
import { FEEDBACK, moveLabel } from './chess';
import { FeedbackBadge, ReviewControl } from './Panels';

export default function MovesPanel({ game, ply, variation, variationPly, onNavigate, onVariationNavigate, onReturn, review, showReview, scrollKey, opening }) {
  const scroller = useRef(null), active = useRef(null);
  const rows = useMemo(() => {
    const result = [];
    game.moves.forEach((move, index) => {
      let row = result.at(-1);
      if (!row || row.number !== move.number) { row = { number: move.number }; result.push(row); }
      row[move.color] = { ...move, ply: index + 1 };
    });
    return result;
  }, [game]);
  useEffect(() => {
    if (!active.current || !scroller.current || variation || !scroller.current.clientHeight) return;
    // Preserve the verified rectangle-based auto-scroll (offset parents differ).
    const container = scroller.current, element = active.current;
    const listRect = container.getBoundingClientRect(), moveRect = element.getBoundingClientRect();
    if (moveRect.top < listRect.top + 12 || moveRect.bottom > listRect.bottom - 12) {
      container.scrollTo({ top: Math.max(0, container.scrollTop + moveRect.top - listRect.top - (container.clientHeight - moveRect.height) / 2), behavior: 'auto' });
    }
  }, [ply, variation, scrollKey, game.id]);
  return <section className="moves-content" id="moves-panel" role="tabpanel" aria-label="Recorded game moves">
    <div className="opening-header">{opening || <><h3>Recorded moves</h3><p>{game.moves.length} plies · Original PGN preserved</p></>}</div>
    {showReview && <div className="moves-heading"><ReviewControl game={game} review={review} /></div>}
    {review.running && <div className="review-progress"><span style={{ width: `${review.done / Math.max(1, game.moves.length) * 100}%` }} /></div>}
    <div className="move-column-head"><span>#</span><span><i className="color-disc white" />White</span><span><i className="color-disc black" />Black</span></div>
    <div ref={scroller} className="move-list" aria-label="Recorded game moves">
      <button className={`starting-position ${ply === 0 && !variation ? 'current' : ''}`} onClick={() => onNavigate(0)}>Starting position<span>Start</span></button>
      {rows.map(row => <div key={row.number} className="move-row"><span className="move-number">{row.number}.</span>{['w', 'b'].map(color => {
        const move = row[color];
        return move ? <button ref={move.ply === ply && !variation ? active : null} key={color} className={`move-entry ${move.ply === ply && !variation ? 'current' : ''}`} aria-current={move.ply === ply && !variation ? 'step' : undefined} aria-label={`Go to ${moveLabel(move)}${review.records[move.ply] ? `, ${FEEDBACK[review.records[move.ply].type].label}` : ''}`} onClick={() => onNavigate(move.ply)}><span>{move.san}</span><FeedbackBadge record={review.records[move.ply]} text /></button> : <span key={color} />;
      })}</div>)}
      {!game.moves.length && <div className="empty-moves"><Target size={26} /><strong>Position analysis</strong><p>Play a move to explore a line, or import a game to review its recorded moves.</p></div>}
      <div className="game-result"><span>{game.headers.Result === '*' ? '•' : game.headers.Result}</span>{game.headers.Result === '1-0' ? 'White wins' : game.headers.Result === '0-1' ? 'Black wins' : game.headers.Result === '1/2-1/2' ? 'Draw' : 'Unfinished game'}</div>
    </div>
    {variation && <div className="variation-strip"><div><span className="variation-dot" /><strong>Your analysis line</strong><button className="text-button" onClick={onReturn}>Return to game<ChevronRight size={13} /></button></div><div className="variation-moves"><button className={variationPly === 0 ? 'current' : ''} onClick={() => onVariationNavigate(0)}>↳ Start</button>{variation.moves.map((move, index) => <button key={`${index}-${move.uci}`} className={variationPly === index + 1 ? 'current' : ''} onClick={() => onVariationNavigate(index + 1)} aria-current={variationPly === index + 1 ? 'step' : undefined}>{moveLabel(move)}</button>)}</div></div>}
    <footer className="moves-footer"><span className="feedback-key"><i>!!</i>Brilliant<i>★</i>Best<i className="mistake">?</i>Mistake<i className="blunder">??</i>Blunder</span></footer>
    {review.error && <p role="alert" className="inline-error">{review.error}</p>}
  </section>;
}
