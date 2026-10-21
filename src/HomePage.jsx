import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { SAMPLE_PGN } from './chess';
import ProductDemo, { TiltCard } from './ProductDemo';
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

// v2 homepage (21 Oct 2026 brief): free-during-beta positioning, compact import strip,
// large live demos, subordinate "Coming soon" concepts and a short FAQ.
// Clips are produced by scripts/record-demos.mjs; ProductDemo shows the poster until
// a clip's sources exist and the frame scrolls into view (no load at startup).
const clip = name => [{ src: `/previews/${name}.webm`, type: 'video/webm' }, { src: `/previews/${name}.mp4`, type: 'video/mp4' }];
const FAQ = [
  ['Is Linea free?', 'Linea is free during beta. Future pricing has not been decided.'],
  ['Can I import games from Chess.com or Lichess?', 'Yes. Enter a public username or use the supported game import options. You can also paste or upload a PGN.'],
  ['Do I need an account?', 'No. Imported games and saved reviews stay in this browser.'],
  ['Why can a review take time?', 'Analysis runs on your device. Longer games and deeper searches take more time. You can pause and resume saved progress.'],
  ['Are AI Coach and Opening Lessons available?', 'They are planned features. The homepage shows concept previews.'],
];
export const HOME_SECTIONS = [['how-it-works', 'How it works'], ['game-review', 'Game review'], ['coming-soon', 'Coming soon']];

export default function HomePage({ onImport, onSample, onReviewSample = onSample, onLibrary, onReport, paused, demos = {} }) {
  const root = useRef(null), [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches), [supported, setSupported] = useState(() => { try { const probe = document.createElement('canvas'), context = probe.getContext('webgl2'); context?.getExtension('WEBGL_lose_context')?.loseContext(); return Boolean(context); } catch { return false; } }), [failed, setFailed] = useState(false);
  const failure = useCallback(() => setFailed(true), []);
  const fen = useMemo(() => { const board = new Chess(); board.loadPgn(SAMPLE_PGN); return board.history({ verbose: true })[31].after; }, []);
  useEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)'), change = () => setReduced(preference.matches); preference.addEventListener('change', change);
    try { const probe = document.createElement('canvas'), context = probe.getContext('webgl2'); setSupported(Boolean(context)); context?.getExtension('WEBGL_lose_context')?.loseContext(); } catch { setSupported(false); }
    return () => preference.removeEventListener('change', change);
  }, []);
  const scrollTo = id => document.getElementById(id)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  const sources = name => (demos[name] ? clip(name) : []);
  const fallback = <StaticBoard fen={fen} />;
  return <main className={`homepage ${reduced ? 'reduced' : ''}`} ref={root}>
    <section className="home-hero" aria-labelledby="home-title">
      <div className="hero-copy">
        <span className="beta-badge">FREE DURING BETA</span>
        <h1 id="home-title">Turn your mistakes<br /><em>into better moves.</em></h1>
        <p>Review your chess games, understand key mistakes, and find what to work on next.<br />Import from Chess.com or Lichess, or upload a PGN.</p>
        <div className="hero-actions"><button className="button primary" onClick={() => onImport()}>Review my game <span aria-hidden="true">↗</span></button><button className="button secondary" onClick={() => scrollTo('game-review')}>Watch a sample</button></div>
        <span className="home-privacy">No login needed · Runs in your browser</span>
        <span className="home-compare">Looking for a free alternative to Chess.com Game Review? Try Linea during beta. <a href="#faq" onClick={event => { event.preventDefault(); scrollTo('faq'); }}>About the beta</a></span>
      </div>
      <div className="hero-stage">{supported && !failed && !reduced ? <SceneBoundary fallback={fallback}><Suspense fallback={<div className="hero-scene" aria-hidden="true" />}><HeroChessScene fen={fen} container={root} onFailure={failure} paused={paused} /></Suspense></SceneBoundary> : fallback}</div>
    </section>

    <section className="home-strip" id="how-it-works" aria-labelledby="strip-title">
      <div className="strip-sources"><h2 id="strip-title">Your games. Wherever you play.</h2><div className="strip-buttons"><button onClick={() => onImport('chesscom')}>Chess.com <span aria-hidden="true">↗</span></button><button onClick={() => onImport('lichess')}>Lichess <span aria-hidden="true">↗</span></button><button onClick={() => onImport('pgn')}>Upload PGN <span aria-hidden="true">↗</span></button></div></div>
      <ol className="strip-steps"><li><b>1</b>Import your game</li><li><b>2</b>Review key moments</li><li><b>3</b>Find your next focus</li></ol>
    </section>

    <section className="home-feature" id="game-review" aria-labelledby="review-title">
      <ProductDemo id="brilliant-review-loop" poster="/previews/brilliant-review-loop.jpg" sources={sources('brilliant-review-loop')} status="Available in beta" label="Sample demo" alt="Linea game review: a rook sacrifice is played and labelled Brilliant by the local engine review" summary="Sample demo: a constructed position where the review labels a rook sacrifice Brilliant, using saved local Stockfish evidence." width={1280} height={900} />
      <div className="feature-copy"><span className="chapter-number">GAME REVIEW</span><h2 id="review-title">See the moves that mattered.</h2><p>Spot mistakes, revisit brilliant ideas, and compare your move with a stronger alternative.</p><div className="feature-actions"><button className="button primary" onClick={() => onImport()}>Review my game ↗</button><button className="text-button" onClick={onReviewSample}>Open sample review →</button></div></div>
    </section>

    <section className="home-feature reverse" id="player-insights" aria-labelledby="report-title">
      <ProductDemo id="player-report-loop" poster="/previews/player-report-loop.jpg" sources={sources('player-report-loop')} status="Available in beta" label="Sample demo" alt="Linea player report for a demo player: accuracy across games, a recurring mistake theme and opening results" summary="Sample demo: a labelled demo player report built from saved Linea reviews of fixture games." width={1280} height={800} />
      <div className="feature-copy"><span className="chapter-number">PLAYER INSIGHTS</span><h2 id="report-title">Find the patterns behind your mistakes.</h2><p>Review your last 10 games—or choose the games you want—to spot recurring mistakes, compare accuracy, and explore your opening results.</p><p className="feature-note">Filter by Rapid, Blitz or Bullet.</p><div className="feature-actions"><button className="button primary" onClick={() => onImport()}>Analyze my games ↗</button><button className="text-button" onClick={onReport}>Recent player reports →</button></div></div>
    </section>

    <section className="home-upcoming" id="coming-soon" aria-labelledby="upcoming-title">
      <div className="upcoming-head"><h2 id="upcoming-title">More ways to learn. <em>Coming soon.</em></h2><p>We are building the next steps beyond game review.</p></div>
      <div className="upcoming-grid">
        <TiltCard as="article" className="upcoming-card"><ProductDemo tilt={false} id="ai-coach-concept-loop" poster="/previews/ai-coach-concept-loop.jpg" sources={sources('ai-coach-concept-loop')} status="Coming soon" label="Concept preview" alt="Concept preview: Linea's rook mascot explains a knight development move beside the board" width={1280} height={800} /><h3>A coach for your next question.</h3><p>Planned: ask why a move works, explore an alternative, and get an explanation you can follow.</p></TiltCard>
        <TiltCard as="article" className="upcoming-card"><ProductDemo tilt={false} id="opening-lesson-concept-loop" poster="/previews/opening-lesson-concept-loop.jpg" sources={sources('opening-lesson-concept-loop')} status="Coming soon" label="Concept preview" alt="Concept preview: an Italian Game lesson replays 1.e4 e5 2.Nf3 Nc6 3.Bc4" width={1280} height={800} /><h3>Learn the ideas behind the opening.</h3><p>Planned: practise common openings, understand the key moves, and learn the plans behind them.</p></TiltCard>
      </div>
    </section>

    <section className="home-faq" id="faq" aria-labelledby="faq-title"><h2 id="faq-title">Questions</h2>{FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</section>

    <section className="home-finale"><h2>Make your next game<br />a learning opportunity.</h2><div className="hero-actions"><button className="button primary" onClick={() => onImport()}>Review my game ↗</button><button className="button secondary" onClick={() => scrollTo('game-review')}>Watch a sample</button></div><p>Free during beta · No login needed</p></section>
    <footer className="home-footer"><span>linea.</span><p>Linea is an independent app and is not affiliated with Chess.com or Lichess. Stockfish 19 Lite runs locally.</p><button className="text-button" onClick={onLibrary}>Open local library</button></footer>
  </main>;
}
