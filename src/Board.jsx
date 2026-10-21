import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { PIECE_NAMES, UNICODE, FEEDBACK, scoreText, advantage } from './chess';
import MoveIcon from './MoveIcon';

export function Piece({ piece, style = 'classic', className = '' }) {
  if (!piece) return null;
  return style === 'figurine'
    ? <span aria-hidden="true" className={`figurine ${piece.color === 'w' ? 'white-piece' : 'black-piece'} ${className}`}>{UNICODE[`b${piece.type}`]}</span>
    : <img aria-hidden="true" alt="" draggable="false" className={`piece-image ${className}`} src={`/pieces/cburnett/${piece.color}${piece.type}.svg`} />;
}

function Arrow({ from, to, color, engine, index, point, id }) {
  const a = point(from), b = point(to);
  if (!a || !b || from === to) return null;
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const dx = (b.x - a.x) / length, dy = (b.y - a.y) / length;
  const marker = `${id}-${index}`;
  return <g className={engine ? 'engine-arrow' : 'manual-arrow'}>
    <defs><marker id={marker} markerWidth={engine ? 5.5 : 4.8} markerHeight={engine ? 5.5 : 4.8} refX="9" refY="5" orient="auto" markerUnits="strokeWidth" viewBox="0 0 12 10">
      {engine ? <path d="M1 1 L8 5 L1 9" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /> : <path d="M0 0 L10 5 L0 10 Z" fill={color} />}
    </marker></defs>
    <line x1={a.x + dx * 14} y1={a.y + dy * 14} x2={b.x - dx * (engine ? 21 : 27)} y2={b.y - dy * (engine ? 21 : 27)} stroke={color} strokeWidth={engine ? 7 : 12} strokeLinecap="round" strokeDasharray={engine ? '15 12' : undefined} markerEnd={`url(#${marker})`} opacity={engine ? .93 : .76} />
    {engine && <g transform={`translate(${a.x + (b.x - a.x) * .48},${a.y + (b.y - a.y) * .48})`}><circle r="16" fill={color} stroke="var(--engine-arrow-label)" strokeWidth="2" /><text textAnchor="middle" dominantBaseline="central" fill="var(--engine-arrow-label)" fontSize="19" fontWeight="700">{index + 1}</text></g>}
  </g>;
}

export function EvaluationBar({ line, flipped, thinking }) {
  const whiteShare = !line ? 50 : line.mate !== null && line.mate !== undefined ? line.cp >= 0 ? 98 : 2 : Math.max(5, Math.min(95, 50 + 45 * Math.tanh(line.cp / 450)));
  return <div className={`eval-track ${flipped ? 'flipped' : ''}`} role="img" aria-label={`Evaluation from White’s perspective: ${scoreText(line)}. ${advantage(line)}.`} title={`${scoreText(line)} · ${advantage(line)}. Positive scores favor White; negative scores favor Black.`}>
    <div className="eval-white" style={{ height: `${whiteShare}%` }} />
    <span className={`eval-number ${line?.cp > 0 ? 'favors-white' : ''}`}>{line?.mate !== null && line?.mate !== undefined ? `M${Math.abs(line.mate)}` : line ? Math.abs(line.cp / 100).toFixed(1) : '—'}</span>
    {thinking && <span className="eval-thinking" />}
  </div>;
}

export default function Board({ chess, flipped, settings, lastMove, feedback, annotations, onAnnotate, mode, tool, ink, engineArrows, onMove, announce, resetKey, onInteraction }) {
  const root = useRef(null), gesture = useRef(null);
  const [selected, setSelected] = useState(null), [drag, setDrag] = useState(null), [preview, setPreview] = useState(null);
  const [arrowStart, setArrowStart] = useState(null), [keyboardSquare, setKeyboardSquare] = useState('e4');
  const uid = useId().replace(/:/g, '');
  const fen = chess.fen();
  const files = flipped ? 'hgfedcba' : 'abcdefgh';
  const ranks = flipped ? '12345678' : '87654321';
  const squares = useMemo(() => [...ranks].flatMap(rank => [...files].map(file => file + rank)), [files, ranks]);
  const legalMoves = selected ? chess.moves({ square: selected, verbose: true }) : [];
  const legal = new Map(legalMoves.map(move => [move.to, move]));
  const checkedKing = chess.isCheck() ? squares.find(square => chess.get(square)?.type === 'k' && chess.get(square)?.color === chess.turn()) : null;
  useEffect(() => {
    setSelected(null); setDrag(null); setPreview(null); setArrowStart(null); gesture.current = null;
  }, [fen, mode, tool, flipped, resetKey]);
  const point = square => square?.length === 2 ? { x: files.indexOf(square[0]) * 100 + 50, y: ranks.indexOf(square[1]) * 100 + 50 } : null;
  const squareAt = (x, y) => {
    const rect = root.current.getBoundingClientRect();
    const col = Math.floor((x - rect.left) / rect.width * 8), row = Math.floor((y - rect.top) / rect.height * 8);
    return col >= 0 && col < 8 && row >= 0 && row < 8 ? files[col] + ranks[row] : null;
  };
  const draw = (from, to, erase = false) => {
    onAnnotate({ from, to, color: ink, type: from === to ? 'square' : 'arrow' }, erase);
    announce(erase ? `Erased annotations touching ${to}.` : from === to ? `Highlighted ${to}.` : `Arrow from ${from} to ${to}.`);
  };
  const tryMove = (from, to) => {
    if (chess.moves({ square: from, verbose: true }).some(move => move.to === to)) {
      onMove(from, to); setSelected(null); return true;
    }
    if (to && from !== to) announce(`Not a legal move from ${from} to ${to}.`);
    return false;
  };
  const activate = square => {
    onInteraction();
    if (mode === 'erase') { draw(square, square, true); return; }
    if (mode === 'annotate') {
      if (tool === 'arrow') {
        if (arrowStart) { draw(arrowStart, square); setArrowStart(null); setPreview(null); }
        else { setArrowStart(square); setPreview({ from: square, to: square, color: ink }); announce(`Arrow starts on ${square}. Choose its destination.`); }
      } else draw(square, square);
      return;
    }
    if (selected && square !== selected && tryMove(selected, square)) return;
    const piece = chess.get(square);
    const next = piece?.color === chess.turn() ? (selected === square ? null : square) : null;
    setSelected(next);
    if (next) announce(`${piece.color === 'w' ? 'White' : 'Black'} ${PIECE_NAMES[piece.type]} on ${square}. ${chess.moves({ square }).length} legal moves.`);
  };
  const pointerDown = event => {
    if (event.button !== 0 && event.button !== 2) return;
    const square = squareAt(event.clientX, event.clientY);
    if (!square) return;
    event.preventDefault();
    onInteraction();
    const piece = chess.get(square);
    const drawing = event.button === 2 || mode !== 'move';
    gesture.current = { from: square, x: event.clientX, y: event.clientY, drawing, right: event.button === 2, piece, moved: false };
    if (drawing) { setSelected(null); setPreview({ from: square, to: square, color: ink }); }
    root.current.setPointerCapture(event.pointerId);
    setKeyboardSquare(square);
    event.target.closest('button')?.focus({ preventScroll: true });
  };
  const pointerMove = event => {
    const g = gesture.current;
    if (!g) return;
    const square = squareAt(event.clientX, event.clientY);
    if (Math.hypot(event.clientX - g.x, event.clientY - g.y) > 7) g.moved = true;
    if (g.drawing && square) setPreview({ from: g.from, to: square, color: ink });
    if (!g.drawing && g.piece?.color === chess.turn() && g.moved) {
      setSelected(g.from);
      const rect = root.current.getBoundingClientRect();
      setDrag({ from: g.from, piece: g.piece, x: event.clientX - rect.left, y: event.clientY - rect.top, size: rect.width / 8 });
    }
  };
  const pointerUp = event => {
    const g = gesture.current;
    if (!g) return;
    const square = squareAt(event.clientX, event.clientY);
    gesture.current = null; setDrag(null); setPreview(null);
    if (root.current.hasPointerCapture(event.pointerId)) root.current.releasePointerCapture(event.pointerId);
    if (!square) return;
    if (g.drawing) {
      if (!g.right && mode === 'erase') draw(g.from, square, true);
      else if (!g.right && tool === 'arrow' && !g.moved) activate(square);
      else if (!g.right && tool === 'square') draw(square, square);
      else { draw(g.from, square); setArrowStart(null); }
    } else if (g.moved && g.piece?.color === chess.turn()) {
      if (!tryMove(g.from, square)) setSelected(g.from);
    } else if (!g.moved) activate(square);
  };
  const keyboard = (event, square) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); activate(square); }
    // Keep plain left/right available for game navigation. Alt+arrows explore the board.
    if (event.altKey && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      const index = squares.indexOf(square), row = Math.floor(index / 8), col = index % 8;
      const nextRow = Math.max(0, Math.min(7, row + (event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0)));
      const nextCol = Math.max(0, Math.min(7, col + (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0)));
      const next = squares[nextRow * 8 + nextCol]; setKeyboardSquare(next);
      root.current.querySelector(`[data-square="${next}"]`)?.focus();
    }
  };
  const engineColors = ['var(--engine-arrow-1)', 'var(--engine-arrow-2)', 'var(--engine-arrow-3)'];
  const allArrows = [...engineArrows.map((arrow, index) => ({ ...arrow, color: engineColors[index], engine: true, index })), ...annotations.filter(a => a.type === 'arrow').map((a, index) => ({ ...a, index: index + 10 })), ...(preview && preview.from !== preview.to ? [{ ...preview, index: 900 }] : [])];
  // Moved piece glides from its origin square (offset in square widths); badge pops after it lands.
  const slide = settings.animation && lastMove && !drag ? { '--slide-x': `${(files.indexOf(lastMove.from[0]) - files.indexOf(lastMove.to[0])) * 100 / .88}%`, '--slide-y': `${(ranks.indexOf(lastMove.from[1]) - ranks.indexOf(lastMove.to[1])) * 100 / .88}%` } : null;
  return <div ref={root} className={`chessboard theme-${settings.theme} ${mode !== 'move' ? 'is-annotating' : ''} ${settings.animation ? 'animate-pieces' : ''}`} role="grid" aria-label={`Chessboard. ${chess.turn() === 'w' ? 'White' : 'Black'} to move. Alt plus arrow keys moves between squares; Enter selects. Left and right navigate the game.`} onContextMenu={event => event.preventDefault()} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { gesture.current = null; setDrag(null); setPreview(null); }}>
    {[...ranks].map((rank, row) => <div className="board-rank" role="row" key={rank}>
      {[...files].map((file, col) => {
        const square = file + rank, piece = chess.get(square), destination = legal.get(square);
        const capture = destination && /[ce]/.test(destination.flags);
        const isLast = lastMove && (lastMove.from === square || lastMove.to === square);
        const marks = annotations.filter(a => a.type === 'square' && a.to === square);
        return <button key={square} type="button" role="gridcell" data-square={square} tabIndex={keyboardSquare === square ? 0 : -1} aria-selected={selected === square} aria-label={`${square}, ${piece ? `${piece.color === 'w' ? 'White' : 'Black'} ${PIECE_NAMES[piece.type]}` : 'empty'}${destination ? capture ? ', legal capture' : ', legal destination' : ''}${square === checkedKing ? ', in check' : ''}${settings.coordinates && col === 0 ? `, rank ${rank}` : ''}${settings.coordinates && row === 7 ? `, file ${file}` : ''}${isLast ? ', last move' : ''}${marks.length ? ', manually highlighted' : ''}${settings.moveBadges && feedback && lastMove?.to === square ? `, ${FEEDBACK[feedback.type].label} move` : ''}`} style={isLast && settings.moveBadges && feedback ? { '--move-tint': FEEDBACK[feedback.type].color } : undefined} className={`square ${(file.charCodeAt(0) - 97 + Number(rank)) % 2 === 0 ? 'light' : 'dark'} ${isLast ? 'last-move' : ''} ${isLast && settings.moveBadges && feedback ? 'move-tinted' : ''} ${selected === square ? 'selected' : ''} ${square === checkedKing ? 'in-check' : ''} ${arrowStart === square ? 'arrow-origin' : ''}`} onKeyDown={event => keyboard(event, square)}>
          {marks.map((mark, i) => <span key={i} className="square-mark" style={{ background: mark.color }} />)}
          {settings.coordinates && col === 0 && <span className="coordinate rank-label" aria-hidden="true" data-label={rank} />}
          {settings.coordinates && row === 7 && <span className="coordinate file-label" aria-hidden="true" data-label={file} />}
          {piece && <span key={lastMove?.to === square ? `moved-${lastMove.from}-${lastMove.to}-${lastMove.san}` : 'piece'} className={`piece-wrap ${drag?.from === square ? 'drag-origin' : ''} ${slide && lastMove?.to === square ? 'piece-slide' : ''}`} style={slide && lastMove?.to === square ? slide : undefined}><Piece piece={piece} style={settings.pieces} /></span>}
          {destination && <span className={`legal-hint ${capture ? 'capture-hint' : ''}`} aria-hidden="true" />}
        </button>;
      })}
    </div>)}
    {settings.moveBadges && feedback && lastMove && (() => { const col = files.indexOf(lastMove.to[0]), row = ranks.indexOf(lastMove.to[1]); return <span key={`badge-${lastMove.from}-${lastMove.to}-${feedback.type}`} aria-hidden="true" className="board-feedback" style={{ left: `min(${(col + 1) * 12.5}%, calc(100% - 9px))`, top: `max(${row * 12.5}%, 9px)` }} title={FEEDBACK[feedback.type].label}><MoveIcon type={feedback.type} size={30} /></span>; })()}
    <svg className="annotation-layer" viewBox="0 0 800 800" aria-hidden="true">
      {allArrows.map(arrow => <Arrow key={`${arrow.engine ? 'e' : 'm'}-${arrow.index}`} {...arrow} point={point} id={uid} />)}
    </svg>
    {drag && <div className="drag-piece" style={{ left: drag.x, top: drag.y, width: drag.size, height: drag.size }}><Piece piece={drag.piece} style={settings.pieces} /></div>}
  </div>;
}
