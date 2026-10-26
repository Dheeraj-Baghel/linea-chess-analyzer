import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ArrowDownUp, ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Check, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, CircleHelp, Clipboard, CornerUpLeft, CornerUpRight, Download, Eraser, Expand, FileText, Flag, Focus, Grid3X3, Keyboard, Maximize2, Minimize2, MoreHorizontal, MousePointer2, Pause, PencilLine, Play, RotateCcw, Settings2, ShieldCheck, SlidersHorizontal, Sparkles, Square, Trash2, Upload, X } from 'lucide-react';
import Board, { EvaluationBar, Piece } from './Board';
import { EnginePanel, PanelTabs, ReviewControl } from './Panels';
import MovesPanel from './MovesPanel';
import ReportPanel from './ReportPanel';
import NavigationBar from './NavigationBar';
import ImportContent from './ImportContent';
import { useImports } from './useImports';
import { useWorkspaceLayout } from './useWorkspaceLayout';
import { useOpening } from './useOpening';
import OpeningInfo from './OpeningInfo';
import { ExportDialog, HelpDialog, IconButton, ImportDialog, Modal, PromotionDialog, SettingsDialog, copyText } from './UI';
import { useGameReview, usePositionEngine } from './useEngine';
import { useVariationReview } from './useVariationReview';
import { VariationFeedbackSummary } from './VariationReviewCard';
import ExplanationPlayback from './ExplanationPlayback';
import { createReviewIllustration, illustrationBoard, illustrationIsCurrent, exploreIllustratedMove, switchIllustrationLine } from './reviewIllustration';
import { illustrationVisuals, ideaHighlights, nextMoveRecommendation } from './explanationVisuals';
import { moveExplanation } from './review';
import { readDisplaySettings, saveDisplaySettings } from './displaySettings';
import { advantage, createSample, DEFAULT_POSITION, gameFromFen, materialInfo, moveLabel, parseGame, positionChess, scoreText, timeControl, toUci, uciMove, VALUES, PIECE_NAMES } from './chess';
import { createEngineCoordinator } from './engineCoordinator';
import { useLocalLibrary } from './useLocalLibrary';
import { safeWorkspaceDraft } from './workspaceDraft';
import LibraryDialog from './LibraryDialog';
import { createGameBrowser } from './gameBrowser';
import GamesPage from './GamesPage';
import ProductImportDialog from './ProductImportDialog';
import { readWorkspaceRoute, writeWorkspaceRoute } from './workspaceRoute';
import ReviewWorkspacePanel from './ReviewWorkspacePanel';
import { ReviewBreakdown, ReviewProvenance, ReviewQuality } from './ReviewDetails';
import { AccuracySummary, PersonalCoach } from './ReviewInsights';
import { createBatchReview } from './batchReview';
import PlayerReportPage from './PlayerReportPage';
import HomePage, { HOME_SECTIONS } from './HomePage';
// Clips that have been recorded/encoded into public/previews (see scripts/record-demos.mjs).
import demoManifest from './demo-manifest.json';
const DEMO_CLIPS = Object.fromEntries((demoManifest.clips || []).filter(item => item.encoded).map(item => [item.id, true]));
import SavedReportsDialog from './SavedReportsDialog';
// Homepage review clip and its 'Open sample review' CTA use the same validated fixture.
import BRILLIANT_SAMPLE_PGN from '../tests/fixtures/stockfish19-drawing-sacrifice.pgn?raw';

// Manual ink keeps its original colors and separate meaning from engine arrows.
const COLORS = [
  { name: 'Fern', value: 'var(--annotation-fern)' },
  { name: 'Blue', value: 'var(--annotation-blue)' },
  { name: 'Amber', value: 'var(--annotation-amber)' },
  { name: 'Rose', value: 'var(--annotation-rose)' },
];
function clockLabel(clock) { return clock?.replace(/^0:(\d\d:\d\d(?:\.\d+)?)$/, '$1') || '—'; }

function PlayerRow({ color, game, chess, history, mainPly, settings, material }) {
  const name = game.headers[color === 'w' ? 'White' : 'Black'] || (color === 'w' ? 'White' : 'Black');
  const rating = game.headers[color === 'w' ? 'WhiteElo' : 'BlackElo'];
  const clock = game.moves.slice(0, mainPly).filter(move => move.color === color && move.clock).at(-1)?.clock;
  const captures = history.filter(move => move.color === color && move.captured).map(move => ({ color: color === 'w' ? 'b' : 'w', type: move.captured })).sort((a, b) => VALUES[b.type] - VALUES[a.type]);
  const ahead = color === 'w' ? material.balance : -material.balance;
  return <div className={`player-row player-${color} ${chess.turn() === color ? 'player-to-move' : ''}`}>
    <div className={`player-avatar ${color === 'w' ? 'white-avatar' : 'black-avatar'}`}><Piece piece={{ color, type: 'k' }} style={settings.pieces} /></div>
    <div className="player-details"><div className="player-name"><strong>{name}</strong><span className="player-rating">{rating && rating !== '?' && rating !== '-' ? rating : 'Unrated'}</span></div><div className="captured-pieces" aria-label={`Pieces captured by ${name}: ${captures.length ? captures.map(piece => PIECE_NAMES[piece.type]).join(', ') : 'none'}`}>
      {captures.length ? captures.map((piece, index) => <span key={`${piece.type}-${index}`}><Piece piece={piece} style={settings.pieces} /></span>) : <span className="no-captures">No captures yet</span>}{ahead > 0 && <b className="material-plus" title={`${color === 'w' ? 'White' : 'Black'} has a ${ahead}-point material advantage`}>+{ahead}</b>}
    </div></div>
    <div className={`player-clock ${clock ? '' : 'no-clock'}`} title={clock ? 'Recorded PGN clock time, not a live countdown. Analysis variations keep the last recorded clock at their starting point.' : 'No recorded clock for this player at this position'}><span className="clock-status" />{clockLabel(clock)}<span className="sr-only">{clock ? ' recorded clock' : ' no recorded clock'}</span></div>
  </div>;
}

export default function App() {
  const [screen, setScreen] = useState(() => { const route = readWorkspaceRoute(); return route.kind === 'sample' || route.kind === 'review' ? 'review' : route.kind === 'games' ? 'games' : route.kind === 'player-report' ? 'player-report' : 'home'; });
  const [coordinator] = useState(() => createEngineCoordinator());
  const [sampleAutoId, setSampleAutoId] = useState(null);
  const [offlineNotice, setOfflineNotice] = useState(import.meta.env.DEV ? 'Offline reload is prepared by the production build, not this development server.' : 'Preparing offline review assets…');
  useEffect(() => { const status = event => setOfflineNotice(event.detail); window.addEventListener('linea-offline-status', status); return () => window.removeEventListener('linea-offline-status', status); }, []);
  const [game, setGame] = useState(createSample), [ply, setPly] = useState(28);
  const opening = useOpening(game);
  const [variation, setVariation] = useState(null), [variationPly, setVariationPly] = useState(0);
  const [illustration, setIllustration] = useState(null);
  const [settings, setSettings] = useState(readDisplaySettings), [flipped, setFlipped] = useState(false);
  const [mode, setMode] = useState('move'), [annotationTool, setAnnotationTool] = useState('free'), [ink, setInk] = useState(COLORS[0].value);
  const [annotationMap, setAnnotationMap] = useState({});
  const [engineEnabled, setEngineEnabled] = useState(false), [candidateCount, setCandidateCount] = useState(1), [depth, setDepth] = useState(16);
  const [bestArrow, setBestArrow] = useState(true), [multiArrows, setMultiArrows] = useState(false);
  const [playing, setPlaying] = useState(false), [speed, setSpeed] = useState(1);
  const [onlyMistakes, setOnlyMistakes] = useState(false), [enteredGame, setEnteredGame] = useState(null);
  const [activePanel, setActivePanel] = useState('moves'), [mobileTab, setMobileTab] = useState('board');
  const [contentTab, setContentTab] = useState('summary');
  const [coachColor, setCoachColor] = useState('w');
  const layout = useWorkspaceLayout();
  const [focusMode, setFocusMode] = useState(false), [modal, setModal] = useState(null), [promotion, setPromotion] = useState(null);
  const [toast, setToast] = useState(null), [announcement, setAnnouncement] = useState('');
  const [boardReset, setBoardReset] = useState(0);
  const audio = useRef(null), toastTimer = useRef(null);
  const review = useGameReview(game, coordinator);
  const shownIllustration = screen === 'review' && illustrationIsCurrent(illustration, { game, ply, variation, variationPly, review }) ? illustration : null;
  const isIllustrating = Boolean(shownIllustration);
  const illustrationHadFocus = useRef(false);
  useEffect(() => {
    const wasIllustrating = illustrationHadFocus.current; illustrationHadFocus.current = isIllustrating;
    if (screen !== 'review') return;
    if (isIllustrating) {
      // Enter/read the illustration once, and when switching phone surfaces;
      // stepping must not steal keyboard focus from its playback controls.
      const panel = [...document.querySelectorAll('.explanation-playback')].find(node => node.getClientRects().length);
      panel?.focus({ preventScroll: true });
    } else if (wasIllustrating) {
      const source = [...document.querySelectorAll('.show-why-button')].find(node => node.getClientRects().length);
      (source || document.getElementById('analysis-board'))?.focus({ preventScroll: true });
    }
  }, [isIllustrating, screen, mobileTab]);
  const chess = useMemo(() => shownIllustration ? illustrationBoard(game, shownIllustration) : positionChess(game, ply, variation, variationPly), [game, ply, variation, variationPly, shownIllustration]);
  const fen = chess.fen();
  const history = useMemo(() => chess.history({ verbose: true }), [chess]);
  const position = useMemo(() => `position fen ${game.initialFen}${history.length ? ` moves ${history.map(toUci).join(' ')}` : ''}`, [game.initialFen, history]);
  const engine = usePositionEngine({ chess, position, count: candidateCount, enabled: engineEnabled && !isIllustrating, depth, coordinator });
  const variationReview = useVariationReview({ game, variation, variationPly, review, coordinator, active: screen === 'review', enabled: !engineEnabled && !isIllustrating });
  useEffect(() => { if (illustration && !isIllustrating) { setIllustration(null); setPlaying(false); } }, [illustration, isIllustrating]);
  useEffect(() => { if (sampleAutoId === game.id && screen === 'review') { setSampleAutoId(null); review.start(); } }, [sampleAutoId, game.id, screen, review]);
  useEffect(() => { const timer = setTimeout(() => setEnteredGame(game.id), 600); return () => clearTimeout(timer); }, [game.id]);
  const stopReview = review.stop;
  useEffect(() => { if (review.running) setEngineEnabled(false); }, [review.running]);
  useEffect(() => {
    const hide = () => { if (document.hidden) { setPlaying(false); setEngineEnabled(false); stopReview(); coordinator.pauseAll(); } };
    document.addEventListener('visibilitychange', hide);
    return () => document.removeEventListener('visibilitychange', hide);
  }, [coordinator, stopReview]);
  useEffect(() => () => coordinator.dispose(), [coordinator]);
  const draft = useMemo(() => ({ ply, variation, variationPly, flipped, activePanel, contentTab, coachColor, quality: review.selectedQuality, displayedQuality: review.generation?.policy.id || null, annotations: Object.fromEntries(Object.entries(annotationMap).filter(([key]) => key.startsWith(`${game.id}|`)).map(([key, value]) => [key.slice(game.id.length + 1), value])) }), [ply, variation, variationPly, flipped, activePanel, contentTab, coachColor, review.selectedQuality, review.generation?.policy.id, annotationMap, game.id]);
  const local = useLocalLibrary({ game, review, draft,
    onOpen(next, value) {
      batch.pause('Batch paused while a saved foreground game is open.');
      const saved = safeWorkspaceDraft(next, value);
      setEngineEnabled(false); setGame(next); setPly(saved.ply); setVariation(saved.variation); setVariationPly(saved.variationPly);
      setFlipped(saved.flipped); setActivePanel(saved.activePanel); setContentTab(saved.contentTab); setCoachColor(saved.coachColor); review.setQuality(saved.quality);
      setAnnotationMap(Object.fromEntries(Object.entries(saved.annotations).map(([fen, marks]) => [`${next.id}|${fen}`, marks])));
      setPlaying(false); setModal(null); setMobileTab('board'); setPromotion(null); setMode('move'); setScreen('review');
    },
    onRoute(route) {
      setPlaying(false); setModal(null); setEngineEnabled(false); review.stop();
      if (route.kind === 'root') { setScreen('home'); return; }
      if (route.kind === 'games') { setScreen('games'); browser.search(route.provider, route.username, { restore: true }); return; }
      if (route.kind === 'player-report') { setScreen('player-report'); batch.restore(route.key).catch(reason => setAnnouncement(reason.message)); return; }
      setScreen('review'); setVariation(null); setVariationPly(0); if (route.ply !== null) setPly(Math.min(game.moves.length, route.ply)); setActivePanel(route.view);
    },
    onLibrary() { setPlaying(false); setModal('library'); },
  });
  const [browser] = useState(() => createGameBrowser({ library: local.library }));
  const browseState = useSyncExternalStore(browser.subscribe, browser.getSnapshot);
  const [batch] = useState(() => createBatchReview({ library: local.library, coordinator }));
  const batchState = useSyncExternalStore(batch.subscribe, batch.getSnapshot);
  const lastGameId = useRef(game.id);
  useEffect(() => { if (lastGameId.current !== game.id) { lastGameId.current = game.id; document.getElementById('analysis-board')?.focus({ preventScroll: true }); window.scrollTo(0, 0); } }, [game.id]);
  useEffect(() => () => browser.dispose(), [browser]);
  useEffect(() => () => batch.dispose(), [batch]);
  const goHome = () => { setPlaying(false); setEngineEnabled(false); review.stop(); setScreen('home'); writeWorkspaceRoute('/'); };
  const goGames = () => {
    const provider = browseState.account ? browseState.provider : batchState.manifest?.provider, username = browseState.account ? browseState.username : batchState.manifest?.username;
    setPlaying(false); setEngineEnabled(false); review.stop();
    if (!provider || !username) { goHome(); return; }
    if (!browseState.account) browser.search(provider, username, { restore: true });
    setScreen('games'); writeWorkspaceRoute(`/games/${provider}/${encodeURIComponent(username)}`);
  };
  const openReport = key => { setPlaying(false); setEngineEnabled(false); review.stop(); setScreen('player-report'); batch.restore(key).catch(reason => notify(reason.message, 'error')); writeWorkspaceRoute(`/player-report/${encodeURIComponent(key)}`); };
  const firstLine = engine.data?.lines?.[0];
  const lastMove = history.at(-1);
  const material = materialInfo(chess);
  const annotationKey = `${game.id}|${fen}`, annotations = annotationMap[annotationKey] || [];
  const currentIndex = shownIllustration ? shownIllustration.step : variation ? variationPly : ply, maxIndex = shownIllustration ? shownIllustration.line.length : variation ? variation.moves.length : game.moves.length;
  const topColor = flipped ? 'w' : 'b', bottomColor = flipped ? 'b' : 'w';
  const currentFeedback = shownIllustration ? shownIllustration.lineMode !== 'alternative' && shownIllustration.step === 1 ? shownIllustration.sourceRecord : null : variation ? variationReview.record : review.records[ply];
  const mainPly = variation ? variation.basePly : ply;
  // Current-position best preview is a NEXT-move suggestion (user-requested),
  // not an explanation of the preceding move. Keep it visibly labelled and
  // separate from the Show why comparison/continuation arrows.
  const selectedMove = variation ? variation.moves[variationPly - 1] : game.moves[ply - 1];
  const feedbackGeneration = variation ? currentFeedback?.provenance?.generationId : review.generation?.id;
  const boardExplanation = useMemo(() => !shownIllustration && currentFeedback ? moveExplanation(selectedMove, currentFeedback, { game, ply, variation, variationPly, generationId: feedbackGeneration }) : null, [shownIllustration, currentFeedback, selectedMove, game, ply, variation, variationPly, feedbackGeneration]);
  const validArrow = uci => {
    if (typeof uci !== 'string' || uci.length < 4) return null;
    const from = uci.slice(0, 2), to = uci.slice(2, 4), piece = chess.get(from);
    return piece?.color === chess.turn() && chess.moves({ square: from, verbose: true }).some(move => move.to === to) ? { from, to } : null;
  };
  const liveArrows = (!isIllustrating && (!variation || engineEnabled) ? engine.data?.lines || [] : []).slice(0, multiArrows ? candidateCount : 1).map(line => validArrow(line.pv[0])).filter(Boolean);
  const visuals = shownIllustration ? illustrationVisuals(shownIllustration, chess) : { arrows: [], marks: ideaHighlights(boardExplanation, chess) };
  const nextRecommendation = !shownIllustration ? nextMoveRecommendation(chess, { generationId: feedbackGeneration, nextRecord: !variation ? review.records[ply + 1] : null, position: !variation ? review.positions?.[ply] : null, currentRecord: currentFeedback }) : null;
  const engineArrows = shownIllustration ? visuals.arrows : bestArrow ? engineEnabled && liveArrows.length ? liveArrows : nextRecommendation ? [nextRecommendation] : [] : [];
  const notify = useCallback((message, type = 'success') => {
    clearTimeout(toastTimer.current); setToast({ message, type }); setAnnouncement(message);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);
  useEffect(() => () => { clearTimeout(toastTimer.current); }, []);
  // Chess.com sound set (user-specified, downloaded to public/sounds/): check > capture > move.
  // Plays for the move now shown whenever the displayed position changes by one move.
  const lastMoveShown = useMemo(() => { const history = chess.history({ verbose: true }); return history.at(-1) || null; }, [chess]);
  const soundKey = `${chess.fen()}`, previousSoundKey = useRef(soundKey);
  useEffect(() => {
    if (!settings.sound) return;
    audio.current ||= {};
    for (const name of ['move-self', 'capture', 'move-check']) {
      const clip = audio.current[name] ||= new Audio(`/sounds/${name}.mp3`);
      clip.preload = 'auto';
    }
    // Safari and Chrome may reject play() from the render effect even though the position
    // change followed a click/key press. Unlock the reusable media elements on the next
    // direct interaction, before that interaction's move navigation runs.
    const unlock = () => {
      const clip = audio.current?.['move-self'];
      if (clip) { const volume = clip.volume; clip.volume = 0; clip.play()?.then(() => { clip.pause(); clip.currentTime = 0; clip.volume = volume; }).catch(() => { clip.volume = volume; }); }
      window.removeEventListener('pointerdown', unlock, true); window.removeEventListener('keydown', unlock, true);
    };
    window.addEventListener('pointerdown', unlock, true); window.addEventListener('keydown', unlock, true);
    return () => { window.removeEventListener('pointerdown', unlock, true); window.removeEventListener('keydown', unlock, true); };
  }, [settings.sound]);
  useEffect(() => {
    if (previousSoundKey.current === soundKey) return;
    previousSoundKey.current = soundKey;
    if (!settings.sound || !lastMoveShown) return;
    const name = /[+#]$/.test(lastMoveShown.san) ? 'move-check' : lastMoveShown.captured ? 'capture' : 'move-self';
    try {
      audio.current ||= {};
      const clip = audio.current[name] ||= new Audio(`/sounds/${name}.mp3`);
      clip.currentTime = 0; clip.play()?.catch(() => {});
    } catch { /* Sound is an optional enhancement; board interaction stays available. */ }
  }, [soundKey, lastMoveShown, settings.sound]);
  const updateSetting = (key, value) => {
    setSettings(previous => {
      const next = { ...previous, [key]: value };
      saveDisplaySettings(next); // In-memory preferences still work when storage is unavailable.
      return next;
    });
  };
  const navigate = useCallback((index, pause = true) => {
    const next = Math.max(0, Math.min(maxIndex, index));
    if (pause) setPlaying(false);
    if (shownIllustration) setIllustration(value => value ? { ...value, step: next, view: next > 1 && value.lineMode !== 'alternative' ? 'continuation' : value.view } : null);
    else if (variation) setVariationPly(next); else setPly(next);
  }, [shownIllustration, variation, maxIndex]);
  const navigateGame = index => {
    setPlaying(false); setIllustration(null); setVariation(null); setVariationPly(0);
    setPly(Math.max(0, Math.min(game.moves.length, index)));
  };
  const returnToGame = () => {
    if (!variation) return;
    setPly(variation.basePly); setVariation(null); setVariationPly(0); setPlaying(false); setMode('move');
    setAnnouncement('Back to the original game. Your recorded moves are unchanged.');
  };
  const backToReview = () => {
    if (!shownIllustration) return;
    setMobileTab(shownIllustration.origin.mobileTab); setIllustration(null); setPlaying(false);
    setAnnouncement('Back to the exact reviewed move. Original game and evidence unchanged.');
  };
  const showWhy = explanation => {
    const record = variation ? variationReview.record : review.records[ply];
    const next = createReviewIllustration({ game, ply, variation, variationPly, record, explanation, generationId: review.generation?.id || null, mobileTab });
    if (!next) { setAnnouncement('The explanation no longer matches this move. Select the reviewed move again.'); return; }
    setPlaying(false); setEngineEnabled(false); setIllustration(next); setMobileTab('board'); setMode('move');
    setAnnouncement('Illustrative engine line. No new analysis is requested. Use the arrow keys or playback controls, then Back to review.');
  };
  const replayIllustration = () => { if (shownIllustration) { setIllustration(value => ({ ...value, step: 0 })); setPlaying(true); } };
  const compareIllustration = mode => { if (shownIllustration) { setPlaying(false); setIllustration(value => switchIllustrationLine(value, mode)); } };
  const followIllustration = () => { if (shownIllustration) { setPlaying(false); setIllustration(value => ({ ...value, view: 'continuation' })); } };
  const togglePlayback = useCallback(() => {
    if (!maxIndex) return;
    if (!playing && currentIndex === maxIndex) { if (shownIllustration) setIllustration(value => ({ ...value, step: 0 })); else if (variation) setVariationPly(0); else setPly(0); }
    setPlaying(value => !value);
  }, [playing, currentIndex, maxIndex, variation, shownIllustration]);
  useEffect(() => {
    if (!playing) return;
    if (currentIndex >= maxIndex) { setPlaying(false); return; }
    const next = activePanel === 'guided' && onlyMistakes && !variation && !isIllustrating ? game.moves.findIndex((move, index) => index + 1 > currentIndex && move.color === coachColor && review.records[index + 1]?.loss > 3) + 1 : currentIndex + 1;
    if (!next) { setPlaying(false); return; }
    const timer = setTimeout(() => navigate(next, false), 1500 / speed);
    return () => clearTimeout(timer);
  }, [playing, speed, currentIndex, maxIndex, navigate, activePanel, onlyMistakes, variation, game, coachColor, review.records, isIllustrating]);
  const explore = (uciMoves) => {
    setPlaying(false);
    if (shownIllustration) {
      try {
        const next = exploreIllustratedMove(game, shownIllustration, shownIllustration.step, uciMoves);
        setIllustration(null); setEngineEnabled(false); setPly(next.basePly); setVariation(next); setVariationPly(next.moves.length);
        setAnnouncement('Illustration ended. You are now exploring your own moves; the original explanation no longer applies.');
      } catch { setAnnouncement('That move is not legal in the illustrated position.'); }
      return;
    }
    const nextChess = positionChess(game, ply, variation, variationPly), added = [];
    for (const uci of uciMoves) {
      try {
        const move = nextChess.move(uciMove(uci));
        added.push({ ...move, uci: toUci(move), number: Number(move.before.split(' ')[5]) });
      } catch { break; }
    }
    if (!added.length) { notify('That continuation is no longer legal at this position.', 'error'); return; }
    if (!variation && added.every((move, index) => game.moves[ply + index]?.uci === move.uci)) {
      setPly(ply + added.length);
      setAnnouncement(`Recorded game: ${moveLabel(added.at(-1))}.`);
    } else if (variation) {
      setEngineEnabled(false);
      setVariation({ ...variation, moves: [...variation.moves.slice(0, variationPly), ...added] });
      setVariationPly(variationPly + added.length);
      setAnnouncement(`Analysis line: ${moveLabel(added.at(-1))}. Original game unchanged.`);
    } else {
      setEngineEnabled(false);
      setVariation({ basePly: ply, moves: added }); setVariationPly(added.length);
      setAnnouncement(`New analysis variation: ${moveLabel(added.at(-1))}. Original game unchanged.`);
    }
  };
  const movePiece = (from, to, promoted) => {
    if (mode !== 'move') return;
    const options = chess.moves({ square: from, verbose: true }).filter(move => move.to === to);
    if (!options.length) return;
    if (options.some(move => move.promotion) && !promoted) {
      setPlaying(false); setPromotion({ from, to, color: chess.turn() }); return;
    }
    explore([from + to + (promoted || '')]);
  };
  const importGame = (type, source, metadata = null, options = {}) => {
    batch.pause('Batch paused while a foreground game is open. Resume it explicitly from the report.');
    const next = { ...(type === 'fen' ? gameFromFen(source) : parseGame(source)), source: metadata, ...(options.snapshot ? { reviewSnapshot: options.snapshot, savedReviewQuality: options.snapshot.generation.policy.id } : {}) };
    setEngineEnabled(false); review.stop(); setScreen('review');
    setGame(next); setPly(options.ply || 0); setVariation(null); setVariationPly(0); setPlaying(false); setAnnotationMap({});
    setMode('move'); setPromotion(null); setModal(null); setMobileTab('board');
    setActivePanel(options.ply ? 'guided' : metadata?.autoReview ? 'report' : 'moves'); setCoachColor(metadata?.color || 'w');
    notify(type === 'fen' ? 'Position loaded. Start exploring.' : metadata?.autoReview ? `${metadata.provider === 'lichess' ? 'Lichess' : metadata.provider === 'chess.com' ? 'Chess.com' : 'PGN'} game loaded. Checking saved evidence before local review.` : 'Game loaded. Your original PGN is preserved.');
  };
  const imports = useImports(importGame);
  const newAnalysis = () => {
    imports.store.resetLoaded();
    importGame('fen', DEFAULT_POSITION);
    setBoardReset(value => value + 1);
    notify('New analysis started. Import drafts are retained; the previous board and review were cleared.');
  };
  const requestNewAnalysis = () => {
    const transient = !game.isSample || variation || review.done || review.running || Object.values(annotationMap).some(marks => marks.length);
    if (transient) { setPlaying(false); setModal('new-analysis'); } else newAnalysis();
  };
  const compareReviewLine = (basePly, uciMoves) => {
    const branch = positionChess(game, basePly, null, 0), moves = [];
    for (const uci of uciMoves) {
      try { const move = branch.move(uciMove(uci)); moves.push({ ...move, uci: toUci(move), number: Number(move.before.split(' ')[5]) }); }
      catch { break; }
    }
    if (!moves.length) { notify('That engine continuation is no longer available.', 'error'); return; }
    setPlaying(false); setMode('move'); setPly(basePly); setEngineEnabled(false);
    setVariation({ basePly, moves }); setVariationPly(moves.length); setMobileTab('board');
    setAnnouncement('Exploring the suggested continuation. Live move review is starting; the original game is unchanged.');
  };
  const toggleAnnotate = () => { setMode(value => value === 'move' ? 'annotate' : 'move'); setPlaying(false); };
  const annotate = (shape, erase = false) => {
    setAnnotationMap(previous => {
      const current = previous[annotationKey] || [];
      const same = mark => mark.type === shape.type && mark.from === shape.from && mark.to === shape.to;
      let next;
      if (erase) next = current.filter(mark => ![shape.from, shape.to].some(square => mark.from === square || mark.to === square));
      else {
        const existing = current.find(same);
        next = current.filter(mark => !same(mark));
        if (!existing || existing.color !== shape.color) next.push(shape);
      }
      return { ...previous, [annotationKey]: next };
    });
  };
  const clearAnnotations = () => {
    setAnnotationMap(previous => ({ ...previous, [annotationKey]: [] }));
    notify('Manual annotations cleared for this position. Engine arrows are unchanged.');
  };
  const copy = async (kind) => {
    try { await copyText(kind === 'FEN' ? fen : game.rawPgn); notify(`${kind} copied to clipboard.`); }
    catch (reason) { notify(reason.message, 'error'); setModal('export'); }
  };
  useEffect(() => {
    const keydown = event => {
      if (screen !== 'review' || event.defaultPrevented || modal || promotion || event.ctrlKey || event.metaKey || event.altKey) return;
      const tag = event.target.tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || event.target.isContentEditable) return;
      const key = event.key.toLowerCase();
      const mistakes = activePanel === 'guided' && onlyMistakes && !variation && !isIllustrating ? game.moves.flatMap((move, index) => move.color === coachColor && review.records[index + 1]?.loss > 3 ? [index + 1] : []) : null;
      if (key === 'arrowleft') { event.preventDefault(); navigate(mistakes ? mistakes.filter(index => index < currentIndex).at(-1) ?? currentIndex : currentIndex - 1); }
      else if (key === 'arrowright') { event.preventDefault(); navigate(mistakes ? mistakes.find(index => index > currentIndex) ?? currentIndex : currentIndex + 1); }
      else if (key === 'home') { event.preventDefault(); navigate(0); }
      else if (key === 'end') { event.preventDefault(); navigate(maxIndex); }
      else if (key === 'f') { event.preventDefault(); setFlipped(value => !value); }
      else if (key === 'a') { event.preventDefault(); toggleAnnotate(); }
      else if (key === 'c') { event.preventDefault(); updateSetting('coordinates', !settings.coordinates); }
      else if (key === '?' || key === 'h') { event.preventDefault(); setModal('help'); }
      else if (key === ' ' && tag !== 'BUTTON') { event.preventDefault(); togglePlayback(); }
      else if (key === 'escape') { if (shownIllustration) { backToReview(); return; } setMode('move'); setPlaying(false); setBoardReset(value => value + 1); setAnnouncement('Move mode. Selection cancelled.'); }
    };
    window.addEventListener('keydown', keydown); return () => window.removeEventListener('keydown', keydown);
  });
  const resultLabel = game.headers.Result === '1-0' ? 'White wins · 1–0' : game.headers.Result === '0-1' ? 'Black wins · 0–1' : game.headers.Result === '1/2-1/2' ? 'Draw · ½–½' : 'Unfinished game';
  const statusText = chess.isCheckmate() ? `Checkmate · ${chess.turn() === 'w' ? 'Black' : 'White'} wins` : chess.isStalemate() ? 'Draw · stalemate' : chess.isThreefoldRepetition() ? 'Draw by repetition (claimable)' : chess.isDrawByFiftyMoves() ? 'Draw by fifty-move rule (claimable)' : chess.isInsufficientMaterial() ? 'Draw · insufficient material' : `${chess.turn() === 'w' ? 'White' : 'Black'} to move${chess.isCheck() ? ' · in check' : ''}`;
  const filename = `${game.headers.White || 'White'}-vs-${game.headers.Black || 'Black'}`.replace(/[^a-z0-9-]/gi, '-');
  const showPanel = tab => { setActivePanel(tab === 'insights' ? 'report' : tab); setMobileTab(tab === 'report' ? 'insights' : tab); };
  const closeReport = () => { setActivePanel('moves'); if (layout.phone) setMobileTab('board'); };
  const engineElement = <EnginePanel engine={engine} fen={fen} enabled={engineEnabled} setEnabled={enabled => { if (enabled) review.stop(); setEngineEnabled(enabled); }} count={candidateCount} setCount={setCandidateCount} depth={depth} setDepth={setDepth} bestArrow={bestArrow} setBestArrow={setBestArrow} multiArrows={multiArrows} setMultiArrows={setMultiArrows} onExplore={uciMoves => { explore(uciMoves); setMobileTab('board'); if (modal === 'engine') setModal(null); }} />;
  const navigation = <NavigationBar playing={playing} variation={variation} illustration={isIllustrating} maxIndex={maxIndex} currentIndex={currentIndex} speed={speed} setSpeed={setSpeed} togglePlayback={togglePlayback} navigate={navigate} flipped={flipped} onFlip={() => setFlipped(value => !value)} />;
  const retryVariationReview = () => { if (engineEnabled) setEngineEnabled(false); else variationReview.retry(); };
  const reportElement = <ReviewWorkspacePanel game={game} review={review} ply={ply} variation={variation} variationPly={variationPly} variationReview={variationReview} illustration={shownIllustration} onCompareIllustration={compareIllustration} onFollowIllustration={followIllustration} onShowWhy={showWhy} onBackToReview={backToReview} onIllustrationNavigate={navigate} onReplayIllustration={replayIllustration} onRetryVariation={retryVariationReview} onVariationNavigate={index => { setPlaying(false); setVariationPly(index); }} onReturn={returnToGame} onNavigate={navigateGame} onCompare={compareReviewLine} onContinue={explore} coachColor={coachColor} setCoachColor={setCoachColor} guided={isIllustrating || Boolean(variation) || activePanel === 'guided'} onStart={() => { setPlaying(false); setActivePanel('guided'); }} onOverview={() => { setPlaying(false); setActivePanel('report'); }} engineElement={engineElement} onlyMistakes={onlyMistakes} setOnlyMistakes={setOnlyMistakes} playing={playing} togglePlayback={togglePlayback} preferredTab={contentTab} onTab={setContentTab} opening={<OpeningInfo opening={opening} />} />;
  return <div className={`app workspace-new ${focusMode ? 'focus-view' : ''} ${settings.animation ? '' : 'motion-off'}`}>
    <a className="skip-link" href={screen === 'review' ? '#analysis-board' : '#product-main'}>{screen === 'review' ? 'Skip to chessboard' : 'Skip to content'}</a>
    {/* Phase 1 changes presentation only; game/variation/worker owners stay here. */}
    {screen !== 'review' && <header className="app-header">
      <div className="header-inner">
        <a href="/" className="brand" aria-label="Linea chess analysis" onClick={event => { event.preventDefault(); goHome(); }}><img alt="" src="/favicon.svg" /><span>linea<span className="brand-dot">.</span></span></a>
        <span className="header-divider" /><span className="brand-caption">Analysis studio</span>
        {screen === 'home' && <nav className="home-nav" aria-label="Homepage sections">{HOME_SECTIONS.map(([id, label]) => <a key={id} href={`#${id}`} onClick={event => { event.preventDefault(); document.getElementById(id)?.scrollIntoView({ block: 'start' }); }}>{label}</a>)}</nav>}
        <nav className="header-actions" aria-label="Workspace controls">
          <span className="privacy-label"><ShieldCheck size={15} />Local analysis</span>
          <button className="text-button recent-games-button" onClick={() => local.show()}>Recent local games</button>
          <IconButton icon={Keyboard} label="Keyboard shortcuts and help (?)" onClick={() => setModal('help')} />
          <IconButton icon={Settings2} label="Display settings" onClick={() => setModal('settings')} />
          <button className="button primary import-button" aria-label={screen === 'home' ? 'Review my game' : 'Import game'} onClick={() => { setPlaying(false); setModal('import'); }}>
            <Upload size={16} /><span>{screen === 'home' ? <>Review<span className="import-word"> my game</span></> : <>Import<span className="import-word"> game</span></>}</span>
          </button>
        </nav>
      </div>
    </header>}
    <div id="product-main" tabIndex={-1}>
    {screen === 'home' && <HomePage paused={Boolean(modal)} demos={DEMO_CLIPS} onImport={source => { if (source) { imports.store.setProductDraft({ productSource: source }); if (source === 'pgn') imports.store.setTab('pgn'); } setModal('import'); }} onLibrary={() => local.show()} onReport={() => setModal('reports')} onReviewSample={() => importGame('pgn', BRILLIANT_SAMPLE_PGN.trim(), { provider: 'pgn', autoReview: true, color: 'w' })} onSample={() => { review.stop(); setEngineEnabled(false); const next = createSample(); setGame(next); setSampleAutoId(next.id); setPly(0); setVariation(null); setVariationPly(0); setScreen('review'); setActivePanel('report'); writeWorkspaceRoute('/sample'); }} />}
    {screen !== 'player-report' && batchState.manifest && ['running', 'paused'].includes(batchState.manifest.status) && <div className="batch-background-banner" role="status"><span>{batchState.running ? `Batch running · ${batchState.progress?.game || 1} / ${batchState.manifest.selectedGames.length} games` : 'Batch paused · checkpoints saved; resume explicitly from its report.'}</span><button className="text-button" onClick={() => openReport(batchState.manifest.key)}>Return to player report →</button></div>}
    {screen === 'games' && <GamesPage state={browseState} browser={browser} onImport={() => setModal('import')} onOpen={row => importGame('pgn', row.pgn, { provider: row.provider, id: row.id, url: row.url, username: row.username || browseState.username, color: row.color, autoReview: true })} onAnalyze={async sample => { review.stop(); setEngineEnabled(false); const key = await batch.start(sample); setScreen('player-report'); writeWorkspaceRoute(`/player-report/${encodeURIComponent(key)}`); }} />}
    {screen === 'player-report' && <PlayerReportPage state={batchState} batch={batch} onBack={goGames} onOpen={(item, selectedPly, reportId, quality) => { review.setQuality(quality); importGame('pgn', item.pgn, { provider: item.provider, id: item.id, url: item.url, username: batchState.manifest.username, color: item.color, returnReportId: reportId, autoReview: true }, { ply: selectedPly, snapshot: item.snapshot }); }} />}
    {screen === 'review' && <main className="workspace">
      {/* Analysis page (user mockups, 22 Oct 2026): board column + review panel only. Secondary
          tools (engine, quality, evidence, coaching, annotations, copy) live in Analysis tools. */}
      <h1 className="sr-only">{game.isSample ? 'Ruy Lopez · an open-ended study' : game.headers.Event && game.headers.Event !== '?' ? game.headers.Event : 'Your game'} · {resultLabel}</h1>
      <div className="workspace-actions workspace-topbar">
        <a href="/" className="workspace-brand" aria-label="Linea chess analysis" onClick={event => { event.preventDefault(); goHome(); }}><img alt="" src="/favicon.svg" /><strong>linea<span>.</span></strong></a>
        <button className="text-button" onClick={() => game.source?.returnReportId ? openReport(game.source.returnReportId) : goGames()}>{game.source?.returnReportId ? '← Back to player report' : '← Back'}</button>
        <span className="workspace-game"><span className="sample-badge">{game.isSample ? 'SAMPLE GAME' : game.source?.provider === 'chess.com' ? 'CHESS.COM' : game.source?.provider === 'lichess' ? 'LICHESS' : !game.moves.length ? 'POSITION' : 'IMPORTED PGN'}</span><OpeningInfo opening={opening} /></span>
        <span className="workspace-actions-spacer" />
        <button className="text-button" onClick={() => setModal('tools')}><SlidersHorizontal size={14} />Analysis tools</button>
        <button className="text-button workspace-export" onClick={() => setModal('export')}><Download size={14} />Export</button>
        <button className="button primary workspace-new-analysis" onClick={requestNewAnalysis}>New analysis</button>
      </div>
      {(local.error || local.notice) && <div className={`local-save-notice ${local.error ? 'inline-error' : ''}`} role={local.error ? 'alert' : 'status'}>{local.error || local.notice}{local.error && <button className="text-button" onClick={() => local.retry()}>Retry saving</button>}</div>}
      <nav className="mobile-tabs" aria-label="Analysis workspace views">{[['board', Grid3X3, 'Board'], ['insights', Sparkles, 'Review']].map(([key, Icon, label]) => <button key={key} className={mobileTab === key ? 'selected' : ''} aria-pressed={mobileTab === key} onClick={() => setMobileTab(key)}><Icon size={16} />{label}</button>)}</nav>
      <div className={`analysis-layout ${variation ? 'has-variation' : ''}`}>
        <section id="analysis-board" tabIndex={-1} hidden={layout.phone && mobileTab !== 'board'} className="board-column" aria-label="Interactive analysis board">
          <div className="player-align"><PlayerRow color={topColor} game={game} chess={chess} history={history} mainPly={mainPly} settings={settings} material={material} /></div>
          <div className={`board-and-eval ${enteredGame !== game.id ? 'board-enter' : ''}`}><EvaluationBar line={shownIllustration ? shownIllustration.step === 0 ? shownIllustration.sourceRecord.before : shownIllustration.lineMode !== 'alternative' && shownIllustration.step === 1 ? shownIllustration.sourceRecord.after : null : variation ? variationReview.evaluation || (engineEnabled ? firstLine : null) : firstLine || review.positions?.[ply]} flipped={flipped} thinking={!isIllustrating && (variation ? variationReview.status === 'thinking' || engineEnabled && engine.status === 'thinking' : engine.status === 'thinking')} /><Board chess={chess} flipped={flipped} settings={settings} lastMove={lastMove} feedback={currentFeedback} annotations={annotations} explanationMarks={visuals.marks} onAnnotate={annotate} mode={mode} tool={annotationTool} ink={ink} engineArrows={engineArrows} onMove={movePiece} announce={setAnnouncement} resetKey={boardReset} onInteraction={() => setPlaying(false)} /></div>
          <div className="player-align"><PlayerRow color={bottomColor} game={game} chess={chess} history={history} mainPly={mainPly} settings={settings} material={material} /></div>
          {mode !== 'move' && <div className="annotation-notice"><PencilLine size={14} /><span><strong>{mode === 'erase' ? 'Eraser mode.' : 'Annotation mode.'}</strong> {mode === 'erase' ? 'Tap a square to erase its marks.' : annotationTool === 'arrow' ? 'Tap a start, then a destination.' : 'Tap to highlight. Drag to draw.'} Moves are locked.</span><IconButton icon={X} label="Exit annotation mode" onClick={() => setMode('move')} /></div>}
          {shownIllustration && (layout.phone || focusMode) && <ExplanationPlayback illustration={shownIllustration} compact playing={playing} onNavigate={navigate} onToggle={togglePlayback} onCompare={compareIllustration} onFollow={followIllustration} onReplay={replayIllustration} onBack={backToReview} onDetails={() => { setFocusMode(false); setMobileTab('insights'); }} />}
          {!isIllustrating && variation && (layout.phone || focusMode) && <VariationFeedbackSummary review={variationReview} ply={variationPly} onDetails={() => { setFocusMode(false); setMobileTab('insights'); }} onRetry={retryVariationReview} />}
          {!(isIllustrating && layout.phone) && navigation}
          {!isIllustrating && bestArrow && nextRecommendation && !engineEnabled && <p className="next-move-hint" aria-live="polite">★ {nextRecommendation.label} <span>· current position, not the previous move explanation</span></p>}
          {focusMode && <button className="text-button exit-focus" onClick={() => setFocusMode(false)}><Minimize2 size={14} />Exit focus view</button>}
          <div className="board-info"><span className={`turn-info ${chess.isCheck() ? 'check' : ''}`}><i className={`color-disc ${chess.turn() === 'w' ? 'white' : 'black'}`} />{statusText}</span><span className="material-info" title="Material uses pawn 1, knight 3, bishop 3, rook 5, queen 9. This is separate from the engine evaluation.">{material.label}</span></div>
        </section>
        {!focusMode && <div className="review-column" hidden={layout.phone && mobileTab === 'board'}>{reportElement}</div>}
      </div>
    </main>}
    </div>
    <div className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</div>
    {toast && <div className={`toast ${toast.type}`} role="status">{toast.type === 'error' ? <CircleHelp size={17} /> : <Check size={17} />}<span>{toast.message}</span><button aria-label="Dismiss notification" onClick={() => setToast(null)}><X size={14} /></button></div>}
    {modal === 'import' && <ProductImportDialog onClose={() => setModal(null)} imports={imports} onBrowse={(provider, username) => { setPlaying(false); setEngineEnabled(false); review.stop(); browser.search(provider, username); setScreen('games'); setModal(null); writeWorkspaceRoute(`/games/${provider}/${encodeURIComponent(username)}`); }} />}
    {modal === 'library' && <LibraryDialog local={{ ...local, remove: async key => { const affectsBatch = batchState.manifest?.selectedGames.some(item => item.key === key); if (affectsBatch) await batch.cancel(); await local.remove(key); if (affectsBatch) batch.forget(); }, clear: async () => { await batch.cancel(); browser.cancel(); await local.clear(); browser.clear(); batch.forget(); } }} offlineNotice={offlineNotice} onClose={() => { local.close(); setModal(null); }} />}
    {modal === 'reports' && <SavedReportsDialog batch={batch} onOpen={key => { setModal(null); openReport(key); }} onClose={() => setModal(null)} />}
    {modal === 'tools' && <Modal title="Analysis tools" subtitle="Engine, review quality, evidence, coaching and board marks. Closing this does not stop or restart analysis." onClose={() => setModal(null)} className="tools-drawer">
      <div className="tools-section"><h3>Board</h3><div className="board-toolbar"><button className={`tool-label ${mode === 'annotate' ? 'active' : ''}`} aria-pressed={mode === 'annotate'} onClick={() => { toggleAnnotate(); setModal(null); }}><PencilLine size={16} /><span>Annotate</span><kbd>A</kbd></button><div className="annotation-colors" aria-label="Annotation colors">{COLORS.map(color => <button key={color.name} aria-label={`${color.name} annotation color`} aria-pressed={ink === color.value} className={ink === color.value ? 'chosen' : ''} style={{ '--ink': color.value }} onClick={() => { setInk(color.value); setMode('annotate'); setPlaying(false); setModal(null); }} />)}</div><span className="toolbar-divider" /><IconButton icon={CornerUpRight} label="Two-tap arrow tool: choose the start, then the destination" active={mode === 'annotate' && annotationTool === 'arrow'} onClick={() => { setAnnotationTool(annotationTool === 'arrow' ? 'free' : 'arrow'); setMode('annotate'); setPlaying(false); setModal(null); }} /><IconButton icon={Square} label="Square highlight tool" active={mode === 'annotate' && annotationTool === 'square'} onClick={() => { setAnnotationTool(annotationTool === 'square' ? 'free' : 'square'); setMode('annotate'); setPlaying(false); setModal(null); }} /><IconButton icon={Eraser} label="Eraser: remove annotations touching a square" active={mode === 'erase'} onClick={() => { setMode(mode === 'erase' ? 'move' : 'erase'); setPlaying(false); setModal(null); }} /><IconButton icon={Trash2} label="Clear annotations for this position" onClick={clearAnnotations} disabled={!annotations.length} /><IconButton icon={Grid3X3} label="Toggle board coordinates (C)" active={settings.coordinates} onClick={() => updateSetting('coordinates', !settings.coordinates)} /><IconButton icon={focusMode ? Minimize2 : Maximize2} label={focusMode ? 'Exit expanded board view' : 'Expand board into focus view'} active={focusMode} onClick={() => { setFocusMode(!focusMode); setMobileTab('board'); setModal(null); }} /></div>
        <div className="tools-copy"><button className="text-button" onClick={() => { setModal(null); copy('FEN'); }}><Clipboard size={14} />Copy FEN</button><button className="text-button" onClick={() => { setModal(null); copy('PGN'); }}><FileText size={14} />Copy PGN</button><button className="text-button" onClick={() => { imports.store.setTab('fen'); imports.store.setProductDraft({ productSource: 'secondary' }); setModal('import'); }}>Load FEN</button></div></div>
      {isIllustrating ? <p className="subtle-note">Illustration playback uses stored evidence without running the position engine. Back to review restores the source move; deeper analysis remains an explicit action there.</p> : engineElement}
      <ReviewQuality game={game} review={{ ...review, suspended: Boolean(variation) || isIllustrating, illustrating: isIllustrating }} /><ReviewProvenance review={review} />
      {game.moves.length > 0 && <><ReviewBreakdown game={game} review={review} /><AccuracySummary game={game} review={review} detailsOnly /><PersonalCoach game={game} review={{ ...review, suspended: Boolean(variation) || isIllustrating }} color={coachColor} setColor={setCoachColor} onNavigate={index => { navigateGame(index); setModal(null); }} onCompare={(base, line) => { compareReviewLine(base, line); setModal(null); }} /></>}
    </Modal>}
    {modal === 'engine' && <Modal title="Position engine" subtitle="The same local engine, settings and results. Closing this view does not stop or restart it." onClose={() => setModal(null)} className="engine-drawer">{engineElement}</Modal>}
    {modal === 'new-analysis' && <Modal title="Start a new analysis?" subtitle="This clears the current game, variations, marks and review. Export the original PGN first if you need it. Import drafts are retained." onClose={() => setModal(null)}><div className="modal-actions"><button className="button secondary" onClick={() => setModal(null)}>Keep current analysis</button><button className="button primary" onClick={newAnalysis}>Create new analysis</button></div></Modal>}
    {modal === 'export' && <ExportDialog onClose={() => setModal(null)} fen={fen} pgn={game.rawPgn} filename={filename} notify={notify} isVariation={!!variation} sourceUrl={game.source?.url || game.headers.Link || null} sourceProvider={game.source?.provider || (game.headers.Site === 'Chess.com' ? 'Chess.com' : /lichess\.org/i.test(game.headers.Site || '') ? 'Lichess' : null)} />}
    {modal === 'settings' && <SettingsDialog settings={settings} update={updateSetting} onClose={() => setModal(null)} />}
    {modal === 'help' && <HelpDialog onClose={() => setModal(null)} />}
    {promotion && <PromotionDialog color={promotion.color} style={settings.pieces} onChoose={type => { const pending = promotion; setPromotion(null); movePiece(pending.from, pending.to, type); }} onClose={() => setPromotion(null)} />}
  </div>;
}
