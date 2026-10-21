import { ArrowDownUp, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from 'lucide-react';
import { IconButton } from './UI';

// Presentation only. Current game/branch/ply and playback timer remain in App.
export default function NavigationBar({ playing, variation, maxIndex, currentIndex, speed, setSpeed, togglePlayback, navigate, flipped, onFlip }) {
  return <div className="navigation-bar">
    <div className="playback-control"><IconButton className="autoplay-button" icon={playing ? Pause : Play} label={playing ? 'Pause playback (Space)' : `Autoplay ${variation ? 'variation' : 'game'} (Space)`} onClick={togglePlayback} disabled={!maxIndex} /><select className="speed-select" aria-label="Playback speed" title="Playback speed" value={speed} onChange={event => setSpeed(Number(event.target.value))}><option value={.5}>0.5×</option><option value={1}>1×</option><option value={1.5}>1.5×</option><option value={2}>2×</option></select></div>
    <div className="move-navigation"><IconButton icon={ChevronFirst} label="First position (Home)" disabled={currentIndex === 0} onClick={() => navigate(0)} /><IconButton icon={ChevronLeft} label="Previous move (Left arrow)" disabled={currentIndex === 0} onClick={() => navigate(currentIndex - 1)} /><span className="move-counter"><strong>{currentIndex}</strong><span>/ {maxIndex}</span></span><IconButton icon={ChevronRight} label="Next move (Right arrow)" disabled={currentIndex === maxIndex} onClick={() => navigate(currentIndex + 1)} /><IconButton icon={ChevronLast} label="Last position (End)" disabled={currentIndex === maxIndex} onClick={() => navigate(maxIndex)} /></div>
    <IconButton icon={flipped ? ArrowDownUp : RotateCcw} className="navigation-flip" label="Flip board (F)" onClick={onFlip} />
  </div>;
}
