import { FEEDBACK } from './chess';

// Move-classification icon. User-supplied circular PNGs (public/icons/moves/, 21 Oct 2026);
// classifications without an image (Forced) keep the text glyph on a coloured disc.
export default function MoveIcon({ type, size = 18, className = '' }) {
  const feedback = FEEDBACK[type];
  if (!feedback) return null;
  return feedback.image
    ? <img className={`move-icon ${className}`} src={feedback.image} alt="" aria-hidden="true" draggable="false" width={size} height={size} />
    : <span className={`move-icon move-icon-glyph ${className}`} aria-hidden="true" style={{ width: size, height: size, fontSize: Math.round(size * .5), background: feedback.color }}>{feedback.icon}</span>;
}
