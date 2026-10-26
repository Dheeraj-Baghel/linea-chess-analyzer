import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Upload, FileText, Check, Clipboard, Download, ChevronRight, ArrowUpRight, Keyboard, Info } from 'lucide-react';
import { Piece } from './Board';
import { DEFAULT_POSITION, PIECE_NAMES } from './chess';
import ImportContent from './ImportContent';
import { BOARD_PALETTES } from './displaySettings';

export function IconButton({ icon: Icon, label, className = '', active, children, ...props }) {
  return <button type="button" className={`icon-button ${active ? 'active' : ''} ${className}`} aria-label={label} aria-pressed={typeof active === 'boolean' ? active : undefined} title={label} {...props}>{Icon && <Icon size={18} strokeWidth={1.7} />}{children}</button>;
}

export function Toggle({ checked, onChange, label, description }) {
  return <label className="toggle-row"><span><span className="toggle-label">{label}</span>{description && <span className="toggle-description">{description}</span>}</span><input className="sr-only" type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} /><span className={`switch ${checked ? 'on' : ''}`} aria-hidden="true"><span /></span></label>;
}

export function Modal({ title, subtitle, onClose, children, className = '' }) {
  const ref = useRef(null), titleId = useId();
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement, overflow = document.body.style.overflow;
    const background = document.getElementById('root'), wasInert = background?.inert;
    if (background) background.inert = true;
    document.body.style.overflow = 'hidden';
    // Focus immediately. A delayed focus leaves Safari/WebKit one Tab press
    // away from escaping the dialog before its first control has focus.
    (ref.current?.querySelector('[data-autofocus], textarea, input:not([type="file"]), button') || ref.current)?.focus({ preventScroll: true });
    const handle = event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeRef.current(); }
      if (event.key === 'Tab') {
        const nodes = [...ref.current.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex="0"]')].filter(node => node.getClientRects().length);
        const first = nodes[0], last = nodes.at(-1);
        if (!first) { event.preventDefault(); ref.current.focus(); }
        else {
          // Manage the cycle explicitly: Safari's default Tab behavior can skip
          // buttons unless full keyboard access is enabled in the OS/browser.
          event.preventDefault();
          const current = nodes.indexOf(document.activeElement);
          const next = current < 0 ? event.shiftKey ? nodes.length - 1 : 0 : (current + (event.shiftKey ? -1 : 1) + nodes.length) % nodes.length;
          nodes[next].focus();
        }
      }
    };
    document.addEventListener('keydown', handle, true);
    return () => {
      document.body.style.overflow = overflow;
      if (background) background.inert = wasInert;
      document.removeEventListener('keydown', handle, true);
      // A drawer opener can disappear at a breakpoint. Restore to a real visible
      // workspace control rather than leaving focus on an unmounted presentation.
      const target = previous?.isConnected && previous.getClientRects().length ? previous : document.querySelector('.header-actions button');
      target?.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(<div className="modal-backdrop" onPointerDown={event => { if (event.target === event.currentTarget) closeRef.current(); }}><section ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className={`modal ${className}`}><header className="modal-header"><div><span className="eyebrow">YOUR WORKSPACE</span><h2 id={titleId}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><IconButton icon={X} label="Close dialog" onClick={onClose} /></header>{children}</section></div>, document.body);
}

export async function copyText(text) {
  if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return; }
  const element = document.createElement('textarea'); element.value = text;
  element.style.position = 'fixed'; element.style.opacity = '0'; document.body.appendChild(element); element.select();
  const success = document.execCommand('copy'); element.remove();
  if (!success) throw new Error('Copy is unavailable in this browser. Select the text in Position tools instead.');
}

export function ImportDialog({ onClose, imports }) {
  return <Modal title="Import a game" subtitle="Drafts and searches stay available when this view closes. Choose a result to load it." onClose={onClose} className="import-modal">
    <ImportContent imports={imports} />
  </Modal>;
}

export function ExportDialog({ onClose, fen, pgn, filename, notify, isVariation, sourceUrl, sourceProvider }) {
  const [tab, setTab] = useState('fen');
  const value = tab === 'fen' ? fen : tab === 'pgn' ? pgn : sourceUrl;
  const copy = async () => { try { await copyText(value); notify(`${tab === 'link' ? 'Game link' : tab.toUpperCase()} copied to clipboard.`); } catch (reason) { notify(reason.message, 'error'); } };
  const download = () => {
    const url = URL.createObjectURL(new Blob([pgn], { type: 'application/x-chess-pgn;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `${filename}.pgn`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('Original game PGN downloaded.');
  };
  return <Modal title="Take your analysis with you." subtitle="Copy the current position or export the original game." onClose={onClose}>
    <div className="segmented wide"><button className={tab === 'fen' ? 'selected' : ''} onClick={() => setTab('fen')}>Current FEN</button><button className={tab === 'pgn' ? 'selected' : ''} onClick={() => setTab('pgn')}>Game PGN</button>{sourceUrl && <button className={tab === 'link' ? 'selected' : ''} onClick={() => setTab('link')}>{sourceProvider || 'Source'} link</button>}</div>
    <label className="field-label" htmlFor="export-text">{tab === 'fen' ? `Current position${isVariation ? ' · analysis variation' : ''}` : tab === 'pgn' ? 'Original recorded game' : `Original ${sourceProvider || 'game'} page`}</label>
    <textarea readOnly spellCheck="false" id="export-text" rows={tab === 'fen' ? 4 : tab === 'pgn' ? 9 : 3} value={value || ''} onFocus={event => event.target.select()} />
    <p className="subtle-note">{tab === 'fen' ? 'FEN describes this board position, including side to move, castling rights and move counters.' : tab === 'pgn' ? 'Exploratory moves and manual arrows never overwrite your original PGN.' : 'Open the original provider page for this imported game.'}</p>
    <div className="modal-actions"><button className="button secondary" onClick={download}><Download size={16} />Download PGN</button>{tab === 'link' && <a className="button secondary" href={sourceUrl} target="_blank" rel="noreferrer"><ArrowUpRight size={16} />Open game</a>}<button className="button primary" onClick={copy}><Clipboard size={16} />Copy {tab === 'link' ? 'link' : tab.toUpperCase()}</button></div>
  </Modal>;
}

export function SettingsDialog({ settings, update, onClose }) {
  return <Modal title="Make yourself at home." subtitle="A familiar board. Fewer distractions." onClose={onClose}>
    <div className="settings-section"><h3>Board palette</h3><div className="theme-options">{BOARD_PALETTES.map(([key, name]) => <button key={key} className={`theme-option ${settings.theme === key ? 'chosen' : ''}`} aria-pressed={settings.theme === key} onClick={() => update('theme', key)}><span className={`theme-preview theme-${key}`}>{Array.from({ length: 8 }, (_, i) => <i key={i} className={(i + Math.floor(i / 4)) % 2 ? 'dark' : 'light'} />)}</span><span>{name}{settings.theme === key && <Check size={14} />}</span></button>)}</div><p className="subtle-note">Board colors are independent of Linea's dark workspace. Existing preferences are retained.</p></div>
    <div className="settings-section settings-toggles">
      <Toggle label="Board coordinates" description="Ranks and files follow the board’s orientation." checked={settings.coordinates} onChange={value => update('coordinates', value)} />
      <Toggle label="Move feedback on board" description="An icon for reviewed moves, not just a color." checked={settings.moveBadges} onChange={value => update('moveBadges', value)} />
      <Toggle label="Move sounds" description="Move, capture and check sounds when navigating or making a move." checked={settings.sound} onChange={value => update('sound', value)} />
      <Toggle label="Board animation" description="System reduced-motion preferences always take priority." checked={settings.animation} onChange={value => update('animation', value)} />
    </div><p className="subtle-note">Display preferences are saved only in this browser.</p>
  </Modal>;
}

export function HelpDialog({ onClose }) {
  const shortcuts = [['← / →', 'Previous / next move'], ['Home / End', 'First / last position'], ['Space', 'Play or pause the game'], ['F', 'Flip the board'], ['A', 'Toggle Annotate mode'], ['C', 'Toggle board coordinates'], ['Esc', 'Cancel selection or close a dialog'], ['?', 'Open this guide'], ['Alt + arrows', 'Move keyboard focus around the board'], ['Enter', 'Select a piece, then its destination']];
  return <Modal title="A little guidance." subtitle="Your board, your pace. Here’s how to get around." onClose={onClose} className="help-modal">
    <div className="shortcut-list">{shortcuts.map(([key, action]) => <div key={key}><span>{action}</span><kbd>{key}</kbd></div>)}</div>
    <div className="help-callout"><h3>Make a mark, not a move.</h3><p>Turn on Annotate: drag for an arrow, tap for a square. The two-tap arrow tool also works with touch or keyboard. On desktop, right-click or right-drag annotates without changing modes. Eraser removes marks touching a chosen square.</p><h3>Explore without losing your place.</h3><p>An alternative move opens a separate line. “Return to game” takes you back to its starting point. Clicking a recorded move also returns to the original game.</p><h3>Read the engine, not a verdict.</h3><p>All scores are from White’s perspective: + favors White, − favors Black, and M is a forced mate. Dashed numbered arrows are engine ideas; solid arrows are yours. Review labels are depth-limited estimates, never a guaranteed judgment. Live position analysis is on demand and pauses a game review rather than competing with it.</p><h3>Private by design.</h3><p>Stockfish runs on your device. Games and compatible review checkpoints are saved only in this browser, not uploaded to a server. Recent local games offers reopen and deletion. Browser settings can erase saves; export PGN and review evidence for a portable copy. Analysis stops when the tab is closed; reopen offers Resume.</p></div>
  </Modal>;
}

export function PromotionDialog({ color, style, onChoose, onClose }) {
  return <Modal title="Choose your promotion." subtitle="Your pawn has reached the last rank." onClose={onClose} className="promotion-modal"><div className="promotion-options">{['q', 'r', 'b', 'n'].map(type => <button key={type} onClick={() => onChoose(type)} aria-label={`Promote to ${PIECE_NAMES[type]}`}><Piece piece={{ color, type }} style={style} /><span>{PIECE_NAMES[type]}</span></button>)}</div></Modal>;
}
