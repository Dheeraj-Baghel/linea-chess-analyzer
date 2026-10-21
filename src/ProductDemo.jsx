import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';

// Homepage product clip: silent looping video with poster, sticky user pause,
// replay, lazy source loading and a single-player rule (brief section 9).
let activeVideo = null;
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function ProductDemo({ id, poster, sources = [], status, label, summary, alt, width = 1280, height = 800, className = '' }) {
  const video = useRef(null), frame = useRef(null);
  const [loaded, setLoaded] = useState(false), [playing, setPlaying] = useState(false);
  const userPaused = useRef(reducedMotion()), visible = useRef(false);
  const hasVideo = sources.length > 0;

  const tryPlay = useCallback(() => {
    const node = video.current;
    if (!node || userPaused.current || !visible.current || document.hidden) return;
    if (activeVideo && activeVideo !== node) activeVideo.pause();
    activeVideo = node;
    node.play().catch(() => setPlaying(false));
  }, []);

  useEffect(() => {
    if (!hasVideo || !frame.current) return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      visible.current = entry.isIntersecting && entry.intersectionRatio >= 0.5;
      if (entry.isIntersecting) setLoaded(true);
      if (visible.current) tryPlay(); else video.current?.pause();
    }, { threshold: [0, 0.5] });
    observer.observe(frame.current);
    const onVisibility = () => { if (document.hidden) video.current?.pause(); else tryPlay(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', onVisibility); };
  }, [hasVideo, tryPlay]);

  useEffect(() => { if (loaded) { video.current?.load(); tryPlay(); } }, [loaded, tryPlay]);

  const toggle = () => {
    const node = video.current; if (!node) return;
    if (node.paused) { userPaused.current = false; visible.current = true; tryPlay(); }
    else { userPaused.current = true; node.pause(); }
  };
  const replay = () => { const node = video.current; if (!node) return; node.currentTime = 0; userPaused.current = false; visible.current = true; tryPlay(); };

  return <figure className={`product-demo ${className}`} data-demo={id}>
    <div className="product-demo-frame" ref={frame} style={{ aspectRatio: `${width} / ${height}` }}>
      {hasVideo
        ? <video ref={video} muted playsInline loop preload="none" poster={poster} width={width} height={height} aria-label={alt} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}>
          {loaded && sources.map(source => <source key={source.src} src={source.src} type={source.type} media={source.media} />)}
        </video>
        : <img src={poster} alt={alt} width={width} height={height} loading="lazy" />}
      <div className="product-demo-badges">{status && <span className={`demo-status ${status === 'Coming soon' ? 'soon' : 'live'}`}>{status}</span>}{label && <span className="demo-label">{label}</span>}</div>
      {hasVideo && <div className="product-demo-controls">
        <button type="button" onClick={toggle} aria-label={playing ? `Pause ${label || 'demo'}` : `Play ${label || 'demo'}`}>{playing ? <Pause size={15} /> : <Play size={15} />}</button>
        <button type="button" onClick={replay} aria-label={`Replay ${label || 'demo'}`}><RotateCcw size={15} /></button>
      </div>}
    </div>
    {summary && <figcaption className="product-demo-summary">{summary}</figcaption>}
  </figure>;
}
