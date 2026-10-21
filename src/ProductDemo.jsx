import { useCallback, useEffect, useRef, useState } from 'react';

// Homepage product clip: silent, always-looping video with poster and lazy source loading.
// User request (22 Oct 2026): no pause/replay buttons; every visible clip loops.
// Clips still pause offscreen / in hidden tabs to save CPU, and reduced-motion visitors
// see the poster only (no autoplay).
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// Card with cursor-tracked 3D tilt, scale(1.05) on hover and a glowing border (user request).
// The transform uses CSS custom properties updated onMouseMove; a CSS transition smooths it.
export function TiltCard({ as: Tag = 'div', className = '', children, ...rest }) {
  const node = useRef(null);
  const move = useCallback(event => {
    const card = node.current;
    if (!card || reducedMotion()) return;
    const rect = card.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5, y = (event.clientY - rect.top) / rect.height - 0.5;
    card.style.setProperty('--tilt-x', `${(-y * 10).toFixed(2)}deg`);
    card.style.setProperty('--tilt-y', `${(x * 12).toFixed(2)}deg`);
    card.style.setProperty('--glow-x', `${((x + 0.5) * 100).toFixed(1)}%`);
    card.style.setProperty('--glow-y', `${((y + 0.5) * 100).toFixed(1)}%`);
  }, []);
  const reset = useCallback(() => {
    const card = node.current; if (!card) return;
    card.style.setProperty('--tilt-x', '0deg'); card.style.setProperty('--tilt-y', '0deg');
  }, []);
  return <Tag ref={node} className={`tilt-card ${className}`} onMouseMove={move} onMouseLeave={reset} {...rest}>{children}</Tag>;
}

export default function ProductDemo({ id, poster, sources = [], status, label, summary, alt, width = 1280, height = 800, className = '', tilt = true }) {
  const video = useRef(null), frame = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const visible = useRef(false);
  const hasVideo = sources.length > 0;

  const tryPlay = useCallback(() => {
    const node = video.current;
    if (!node || reducedMotion() || !visible.current || document.hidden) return;
    node.play().catch(() => {});
  }, []);

  useEffect(() => {
    if (!hasVideo || !frame.current) return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      visible.current = entry.isIntersecting;
      if (entry.isIntersecting) setLoaded(true);
      if (visible.current) tryPlay(); else video.current?.pause();
    }, { threshold: [0, 0.25] });
    observer.observe(frame.current);
    const onVisibility = () => { if (document.hidden) video.current?.pause(); else tryPlay(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', onVisibility); };
  }, [hasVideo, tryPlay]);

  useEffect(() => { if (loaded) { video.current?.load(); tryPlay(); } }, [loaded, tryPlay]);

  const media = <div className="product-demo-frame" ref={frame} style={{ aspectRatio: `${width} / ${height}` }}>
    {hasVideo
      ? <video ref={video} muted playsInline loop autoPlay={!reducedMotion()} preload="none" poster={poster} width={width} height={height} aria-label={alt}>
        {loaded && sources.map(source => <source key={source.src} src={source.src} type={source.type} media={source.media} />)}
      </video>
      : <img src={poster} alt={alt} width={width} height={height} loading="lazy" />}
    <div className="product-demo-badges">{status && <span className={`demo-status ${status === 'Coming soon' ? 'soon' : 'live'}`}>{status}</span>}{label && <span className="demo-label">{label}</span>}</div>
  </div>;

  return <figure className={`product-demo ${className}`} data-demo={id}>
    {tilt ? <TiltCard className="demo-tilt">{media}</TiltCard> : media}
    {summary && <figcaption className="product-demo-summary">{summary}</figcaption>}
  </figure>;
}
