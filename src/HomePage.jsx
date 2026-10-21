import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { SAMPLE_PGN } from './chess';
const loadHeroScene = () => import('./HeroChessScene');
if (typeof window !== 'undefined' && !matchMedia('(prefers-reduced-motion: reduce)').matches) loadHeroScene();
const HeroChessScene = lazy(loadHeroScene);
class SceneBoundary extends Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
function StaticBoard({ fen }) {
  const board = useMemo(() => new Chess(fen).board(), [fen]);
  return <div className="hero-static" role="img" aria-label="Static preview of a legal illustrative midgame"><div className="hero-static-board">{board.flat().map((piece, index) => <span className={(Math.floor(index / 8) + index % 8) % 2 ? 'dark' : 'light'} key={index}>{piece && <img src={`/pieces/cburnett/${piece.color}${piece.type}.svg`} alt="" />}</span>)}</div></div>;
}
function TiltPreview({ src, alt, width, height }) {
  const frame = useRef(null);
  const move = useCallback((event) => {
    const node = frame.current;
    if (!node || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = node.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    node.style.setProperty('--tilt-x', `${-y * 8}deg`);
    node.style.setProperty('--tilt-y', `${x * 10}deg`);
  }, []);
  const reset = useCallback(() => {
    frame.current?.style.setProperty('--tilt-x', '0deg');
    frame.current?.style.setProperty('--tilt-y', '0deg');
  }, []);
  return <div className="tilt-preview" ref={frame} onMouseMove={move} onMouseLeave={reset}><img src={src} alt={alt} loading="lazy" width={width} height={height} /></div>;
}
export default function HomePage({ onImport, onSample, onLibrary, onReport, paused }) {
  const root = useRef(null), [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches), [supported, setSupported] = useState(() => { try { const probe = document.createElement('canvas'), context = probe.getContext('webgl2'); context?.getExtension('WEBGL_lose_context')?.loseContext(); return Boolean(context); } catch { return false; } }), [failed, setFailed] = useState(false);
  const failure = useCallback(() => setFailed(true), []);
  const fen = useMemo(() => { const board = new Chess(); board.loadPgn(SAMPLE_PGN); return board.history({ verbose: true })[31].after; }, []);
  useEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)'), change = () => setReduced(preference.matches); preference.addEventListener('change', change);
    try { const probe = document.createElement('canvas'), context = probe.getContext('webgl2'); setSupported(Boolean(context)); context?.getExtension('WEBGL_lose_context')?.loseContext(); } catch { setSupported(false); }
    return () => preference.removeEventListener('change', change);
  }, []);
  const fallback = <StaticBoard fen={fen} />;
  return <main className={`homepage ${reduced ? 'reduced' : ''}`} ref={root}>
    <section className="home-hero"><div className="hero-copy"><span className="eyebrow">YOUR GAMES. A CLEARER PICTURE.</span><h1>Understand<br /><em>every move.</em></h1><p>Find the moments that mattered.<br />Bring that clarity to your next game.</p><div className="hero-actions"><button className="button primary" onClick={onImport}>Import a game <span aria-hidden="true">↗</span></button><button className="text-button" onClick={onSample}>Try a sample →</button></div><span className="home-privacy">No login · Local Stockfish · Your browser, your games</span></div>
      <div className="hero-stage">{supported && !failed && !reduced ? <SceneBoundary fallback={fallback}><Suspense fallback={<div className="hero-scene" aria-hidden="true" />}><HeroChessScene fen={fen} container={root} onFailure={failure} paused={paused} /></Suspense></SceneBoundary> : fallback}</div>
    </section>
    <section className="home-section bring-games"><div><span className="chapter-number">01 / BRING YOUR GAMES</span><h2>Less setup.<br />More understanding.</h2><p>Find completed public games from Chess.com or Lichess. Or paste a PGN. No account connection, login or ownership verification.</p><button className="button primary" onClick={onImport}>Find my games ↗</button></div><div className="home-source-grid"><button onClick={onImport}><strong>Chess.com</strong><span>Public username & game links</span><b aria-hidden="true">↗</b></button><button onClick={onImport}><strong>Lichess</strong><span>Public history from lichess.org</span><b aria-hidden="true">↗</b></button><button onClick={onImport}><strong>Your PGN</strong><span>Paste or upload a single game</span><b aria-hidden="true">↗</b></button><button onClick={onLibrary}><strong>Saved locally</strong><span>Pick up where you left off</span><b aria-hidden="true">↗</b></button></div></section>
    <section className="home-section product-preview"><div><span className="chapter-number">02 / UNDERSTAND KEY MOMENTS</span><h2>A review, not<br />a wall of numbers.</h2><p>Start with both players’ accuracy. Then replay the decisions, find engine-supported alternatives and explore without changing your original game.</p><button className="text-button" onClick={onSample}>Open the sample review →</button><p className="home-fineprint">Example screenshot: fictional fixture players, real local engine evidence. Not an imported account or a promised score.</p></div><TiltPreview src="/previews/review.jpg" alt="Example of Linea’s two-column review with a playable board and focused review panel" width="1440" height="1000" /></section>
    <section className="home-section product-preview report-preview"><TiltPreview src="/previews/report.jpg" alt="Example player report showing actual sample counts and separately labelled reviewed metrics" width="1440" height="2100" /><div><span className="chapter-number">03 / LEARN FROM YOUR LAST TEN</span><h2>A small sample.<br />Useful patterns.</h2><p>Analyze up to ten eligible or selected games. See costly moments, opening results and observed ratings—with coverage and denominators, not invented lifetime statistics.</p><button className="button primary" onClick={onImport}>Analyze my games ↗</button><button className="text-button" onClick={onReport}>Recent player reports →</button><p className="home-fineprint">Browser analysis runs while the app stays open. Pause, return or resume a checkpoint. No promise of complete analysis in seconds.</p></div></section>
    <section className="home-finale"><span className="eyebrow">ONE GAME. ONE CLEARER NEXT STEP.</span><h2>Your next move<br />starts here.</h2><button className="button primary" onClick={onImport}>Import a game ↗</button><p>Private by design. Independent estimates.<br />Always room for a deeper look.</p></section>
    <footer className="home-footer"><span>linea.</span><p>Independent chess review · Stockfish 19 Lite · Local-first</p><button className="text-button" onClick={onLibrary}>Open local library</button></footer>
  </main>;
}
