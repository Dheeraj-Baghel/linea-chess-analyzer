// This is the recorded game's opening, not a classification of the currently
// explored branch. Source labels distinguish supplied headers from local lookup.
export default function OpeningInfo({ opening }) {
  const title = `${opening.eco ? `${opening.eco} · ` : ''}${opening.name}${opening.variation ? `: ${opening.variation}` : ''}`;
  return <div className="opening-info" aria-label="Recorded game opening" data-source={opening.source} title={`${title}. ${opening.sourceLabel}${opening.matchedPly ? `; matched after recorded ply ${opening.matchedPly}${opening.transposed ? ' by transposition' : ''}` : ''}`}>
    <h3>{opening.eco && <span className="opening-eco">{opening.eco}</span>}{opening.name}{opening.variation && <span> · {opening.variation}</span>}</h3>
    <p>{opening.source === 'local' ? `Game opening · local${opening.transposed ? ' transposition' : ''} · ply ${opening.matchedPly}` : opening.sourceLabel}</p>
  </div>;
}
