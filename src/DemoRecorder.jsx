// DEV-ONLY deterministic recording views for homepage clips (brief sections 5-7).
// Loaded only when import.meta.env.DEV and the URL is /demo-record?clip=…; it is
// excluded from production builds. No engine is started: the review clip uses saved
// Stockfish evidence and the report clip uses a saved real batch-review report.
// Every move is played through chess.js, so pieces only move legally.
import { useEffect, useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import Board, { EvaluationBar } from './Board';
import MoveIcon from './MoveIcon';
import { DEFAULT_DISPLAY_SETTINGS } from './displaySettings';
import reviewEvidence from '../tests/fixtures/demo/review-evidence.json';
import reportEvidence from '../tests/fixtures/demo/report-evidence.json';

const SETTINGS = { ...DEFAULT_DISPLAY_SETTINGS, sound: false };
const noop = () => {};
// Advances a step index on a fixed timeline (ms offsets), then loops.
function useTimeline(steps, total) {
  const [step, setStep] = useState(0), [cycle, setCycle] = useState(0);
  useEffect(() => {
    // Recording hook: wall-clock start of each loop, so the recorder can trim exactly one cycle.
    (window.__demoCycles ||= []).push(Date.now());
    const timers = steps.map((at, index) => setTimeout(() => setStep(index), at));
    timers.push(setTimeout(() => { setStep(0); setCycle(c => c + 1); }, total));
    return () => timers.forEach(clearTimeout);
  }, [cycle]); // eslint-disable-line react-hooks/exhaustive-deps
  return step;
}
function replay(fen, sans) { const chess = new Chess(fen); const moves = sans.map(san => chess.move(san)); return { chess, last: moves.at(-1) || null }; }
function DemoBoard({ fen, sans, feedback, marks = [], label, line }) {
  const { chess, last } = useMemo(() => replay(fen, sans), [fen, sans]);
  return <div className="demo-board-wrap">{line !== undefined && <EvaluationBar line={line} flipped={false} thinking={false} />}<Board chess={chess} flipped={false} settings={SETTINGS} lastMove={last} feedback={feedback} annotations={marks} onAnnotate={noop} mode="move" tool="arrow" ink="var(--action)" engineArrows={[]} onMove={noop} announce={noop} resetKey={0} onInteraction={noop} />{label && <span className="demo-corner">{label}</span>}</div>;
}
// Squares the piece on `from` attacks, computed by chess.js from the actual position.
const attacks = (chess, from, color) => ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].flatMap(f => [1, 2, 3, 4, 5, 6, 7, 8].map(r => f + r)).filter(sq => chess.attackers(sq, color).includes(from));
const REVIEW_FEN = '8/8/8/8/8/2R3p1/2pk2P1/7K w - - 0 1'; // FEN header of stockfish19-drawing-sacrifice.pgn
const THEME_TIP = { 'Piece safety': 'before each move, check what your opponent can capture.', 'Forcing replies': 'look for your opponent’s checks first.', 'Candidate comparison': 'compare two candidate moves before choosing.' };

function ReviewClip() {
  // 0 hold before · 1 move played · 2 Brilliant badge · 3 explanation · 4 hold
  const step = useTimeline([0, 1500, 2500, 4000, 6500], 8500);
  const fen = REVIEW_FEN;
  const played = step >= 1, badge = step >= 2;
  const line = { cp: reviewEvidence.searches[played ? 'after' : 'before'].cp, mate: null };
  return <div className="demo-stage review">
    <DemoBoard fen={fen} sans={played ? [reviewEvidence.move] : []} feedback={badge ? { type: 'brilliant' } : null} line={line} />
    <aside className="demo-panel">
      <span className="eyebrow">LINEA REVIEW</span><h2>Game Review</h2>
      <div className={`demo-move ${badge ? 'on' : ''}`}><span>1.</span><strong>{played ? reviewEvidence.move : '…'}</strong>{badge && <em><MoveIcon type="brilliant" size={22} /> Brilliant</em>}</div>
      {step >= 3 && <p className="demo-explain">White gives up the rook with check. After 1…Kxc2 the pawn ending still holds a draw.</p>}
      {step >= 3 && <p className="demo-evidence">Saved local evidence: Stockfish {reviewEvidence.engine.version} · depth {reviewEvidence.searches.accepted.depth} after the capture · {reviewEvidence.searches.accepted.cp === 0 ? 'draw' : (reviewEvidence.searches.accepted.cp / 100).toFixed(1)}</p>}
    </aside>
  </div>;
}

function ReportClip() {
  // 0 header+filter · 1 accuracy chart · 2 recurring theme · 3 openings · 4 takeaway
  const step = useTimeline([0, 2000, 4000, 6000, 8500], 10500);
  const report = reportEvidence.report, games = [...report.games].reverse();
  const theme = report.themes[0], example = theme?.examples[0];
  const exampleGame = example && reportEvidence.manifest.selectedGames.find(g => g.key === example.key);
  const exampleFen = useMemo(() => { if (!exampleGame) return null; const c = new Chess(); c.loadPgn(exampleGame.pgn); return c.history({ verbose: true })[example.ply - 1].before; }, [exampleGame, example]);
  const wins = report.results;
  return <div className="demo-stage report">
    <header className="demo-report-head"><div><span className="eyebrow">DEMO PLAYER REPORT · {report.selected} GAMES</span><h2>Demo Player’s review</h2></div><div className="demo-filter" aria-label="Format filter"><b>All</b><span>Rapid</span><span>Blitz</span><span>Bullet</span></div></header>
    <div className="demo-report-body">
      <section className={`demo-card ${step === 1 ? 'focus' : ''}`}><h3>Accuracy across games</h3><div className="demo-bars">{games.map((g, i) => <span key={g.key} title={g.ready ? g.accuracy.toFixed(1) : 'not score-ready'}>{g.ready ? <i style={{ height: step >= 1 ? `${Math.max(3, g.accuracy)}%` : '3%' }} /> : <em className="demo-na">n/a</em>}<small>{i + 1}</small></span>)}</div><p>{report.completed} of {report.selected} games score-ready · mean {report.meanGameAccuracy.toFixed(1)}%</p></section>
      <section className={`demo-card ${step === 2 ? 'focus' : ''}`}><h3>Costly recurring theme</h3>{step >= 2 && theme ? <><strong className="demo-theme">{theme.name}</strong><p>{theme.count} costly moments across reviewed games</p>{exampleFen && <div className="demo-mini"><DemoBoard fen={exampleFen} sans={[]} /><span>Before {example.number}{example.color === 'w' ? '.' : '…'} {example.san}</span></div>}</> : <p className="demo-muted">…</p>}</section>
      <section className={`demo-card ${step === 3 ? 'focus' : ''}`}><h3>Opening results</h3>{step >= 3 ? report.openings.slice(0, 5).map(o => <div className="demo-opening" key={o.name}><span>{o.name.split(':')[0]}</span><b>{o.count} · {o.win}W {o.draw}D {o.loss}L</b></div>) : <p className="demo-muted">…</p>}</section>
    </div>
    {step >= 4 && theme && <footer className="demo-takeaway"><b>{report.selected} games · {wins.win}W {wins.draw}D {wins.loss}L</b><span>Next focus: {theme.name}. {THEME_TIP[theme.name] ? THEME_TIP[theme.name][0].toUpperCase() + THEME_TIP[theme.name].slice(1) : ''}</span></footer>}
  </div>;
}

function CoachClip() {
  // 0 position · 1 Nf3 played · 2 mascot bubble · 3 highlight attacked squares · 4 hold/fade
  const step = useTimeline([0, 2000, 3000, 5000, 7500], 9000);
  const fen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
  // Central squares the developed knight attacks, derived from the board (expected: d4, e5).
  const targets = useMemo(() => attacks(replay(fen, ['Nf3']).chess, 'f3', 'w').filter(sq => ['d4', 'e4', 'd5', 'e5'].includes(sq)), []);
  const marks = step === 3 ? targets.map(to => ({ type: 'square', from: to, to, color: 'var(--action)' })) : [];
  return <div className="demo-stage concept">
    <DemoBoard fen={fen} sans={step >= 1 ? ['Nf3'] : []} marks={marks} />
    <aside className="demo-coach">
      {step >= 2 && <div className={`demo-coach-say ${step >= 4 ? 'fade' : ''}`}><img src="/mascot/rook-coach.svg" alt="" width="96" height="112" /><div className="demo-bubble">This develops your knight and helps control the centre.</div></div>}
      <div className="demo-chips" aria-hidden="true"><span>Why this move?</span><span>Show an alternative</span></div>
    </aside>
  </div>;
}

function OpeningClip() {
  // 0 initial · 1..5 moves · 6 label+caption+f7 · 7 trail hold
  const line = ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'];
  const step = useTimeline([0, 1000, 2000, 3000, 4000, 5000, 6000, 8500], 10500);
  const played = line.slice(0, Math.min(step, 5));
  const start = new Chess().fen();
  const f7Attacked = useMemo(() => replay(start, line).chess.attackers('f7', 'w').includes('c4'), [start]); // eslint-disable-line react-hooks/exhaustive-deps
  const marks = step >= 6 && f7Attacked ? [{ type: 'arrow', from: 'c4', to: 'f7', color: 'var(--action)' }, { type: 'square', from: 'f7', to: 'f7', color: 'var(--action)' }] : [];
  return <div className="demo-stage concept">
    <DemoBoard fen={start} sans={played} marks={marks} />
    <aside className="demo-lesson">
      <span className="eyebrow">OPENING LESSON</span>
      <h2>{step >= 6 ? 'Italian Game' : 'Common openings'}</h2>
      <ol className="demo-trail">{played.map((san, i) => <li key={i}>{i % 2 === 0 ? `${i / 2 + 1}. ` : ''}{san}</li>)}</ol>
      {step >= 6 && <p className="demo-principle">Develop quickly and prepare to castle.</p>}
      {step >= 6 && f7Attacked && <p className="demo-evidence">The bishop on c4 now eyes f7.</p>}
    </aside>
  </div>;
}

const CLIPS = { review: ReviewClip, report: ReportClip, coach: CoachClip, opening: OpeningClip };
const BADGES = { review: ['Available in beta', 'Sample demo'], report: ['Available in beta', 'Sample demo'], coach: ['Coming soon', 'Concept preview'], opening: ['Coming soon', 'Concept preview'] };
export default function DemoRecorder() {
  const name = new URLSearchParams(location.search).get('clip') || 'review', Clip = CLIPS[name] || ReviewClip;
  const [status, label] = BADGES[name] || BADGES.review;
  // Badges are shown by the homepage ProductDemo overlay (real text); ?badges=1 bakes them in for standalone use.
  const baked = new URLSearchParams(location.search).has('badges');
  return <div className="demo-recorder" data-clip={name}>{baked && <div className="demo-badges"><span className={status === 'Coming soon' ? 'soon' : 'live'}>{status}</span><span>{label}</span></div>}<Clip /></div>;
}
