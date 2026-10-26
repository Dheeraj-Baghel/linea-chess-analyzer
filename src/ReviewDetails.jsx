import { useId, useMemo } from 'react';
import { Pause, RefreshCw, Sparkles } from 'lucide-react';
import { FEEDBACK } from './chess';
import { reviewCategoryCounts, reviewDepthSummary } from './review';
import { evaluationDepthLabel, REVIEW_POLICIES } from './reviewPolicy';
import MoveIcon from './MoveIcon';

// All controls act on the existing App-owned review session. Merely mounting or
// changing these controls never starts a review or changes old result provenance.
export function ReviewQuality({ game, review }) {
  const field = useId(), selected = review.selectedPolicy, generation = review.generation;
  return <section className="review-quality" aria-label="Game review settings">
    <label htmlFor={field} className="field-label">Game review quality</label>
    <select id={field} aria-label="Game review quality" value={review.selectedQuality} onChange={event => review.setQuality(event.target.value)}>
      {Object.values(REVIEW_POLICIES).map(policy => <option key={policy.id} value={policy.id}>{policy.label} · target {policy.targetDepth}</option>)}
    </select>
    <p className="review-budget">Target depth {selected.targetDepth}; up to {selected.positionMs.toLocaleString()} ms per position and {selected.sacrificeMs.toLocaleString()} ms per qualifying sacrifice check. Actual depth can be lower.</p>
    <p className="subtle-note">Disputed moves can add two same-root verification searches and an optional candidate-gap search, each at up to twice the position budget. Analysis can take longer; reached depth is not calibrated confidence.</p>
    <p className="review-policy-state" role="status">{generation ? review.hasPendingSettings ? `Pending: ${selected.label}. Displayed results and any running review still use ${generation.policy.label}. Rerun to apply this selection.` : `Displayed review: ${generation.policy.label} · ${generation.status}.` : `Next review: ${selected.label}. No game review has run.`}</p>
    <div className="review-quality-actions">
      <button className="button primary" disabled={!game.moves.length || review.suspended} onClick={generation ? review.rerun : review.start}>{generation ? <RefreshCw size={15} /> : <Sparkles size={15} />}{generation ? 'Rerun game review' : 'Review this game'}</button>
      {review.running ? <button className="button secondary" onClick={review.stop}><Pause size={15} />Pause review · {review.done}/{game.moves.length}</button> : review.canResume && <button className="button secondary" disabled={review.suspended} onClick={review.resume}>Continue game review</button>}
    </div>
    {review.suspended && <p className="subtle-note">{review.illustrating ? 'This illustration reads stored evidence only. Back to review restores the source move; rerun/deeper review is an explicit action there.' : 'Live move feedback owns the engine while you explore. Return to game to continue the original review.'}</p>}
    <p className="subtle-note">Position depth controls only the current board. Changing this selection does not rerun, relabel or mix existing results. Rerun replaces this review; it does not edit your PGN or analysis branch.</p>
  </section>;
}

export function ReviewBreakdown({ game, review }) {
  const totals = useMemo(() => reviewCategoryCounts(game, review.records, review.generation?.id), [game, review.records, review.generation?.id]);
  return <section className="review-breakdown" aria-label="Per-player move classifications">
    <h4>Move breakdown</h4>
    <table>
      <caption>{totals.reviewed} / {totals.total} plies reviewed{totals.reviewed < totals.total ? ' · partial coverage' : ' · complete coverage'}</caption>
      <thead><tr><th scope="col">Classification</th><th scope="col">White</th><th scope="col">Black</th></tr></thead>
      <tbody>{Object.entries(FEEDBACK).map(([type, feedback]) => <tr key={type} data-category={type}>
        <th scope="row"><span className="feedback-badge" style={{ '--feedback-color': feedback.color }}><span className="feedback-icon" aria-hidden="true"><MoveIcon type={type} /></span>{feedback.label}</span></th>
        <td data-color="w">{totals.categories[type].w}</td><td data-color="b">{totals.categories[type].b}</td>
      </tr>)}</tbody>
      <tfoot>
        <tr data-summary="reviewed"><th scope="row">Reviewed</th><td data-color="w">{totals.w.reviewed}</td><td data-color="b">{totals.b.reviewed}</td></tr>
        <tr data-summary="unreviewed"><th scope="row">Unreviewed</th><td data-color="w">{totals.w.unreviewed}</td><td data-color="b">{totals.b.unreviewed}</td></tr>
        <tr data-summary="total"><th scope="row">Total plies</th><td data-color="w">{totals.w.total}</td><td data-color="b">{totals.b.total}</td></tr>
      </tfoot>
    </table>
    <p className="subtle-note">Each recorded move counts once for its actual color. Unreviewed moves have no assigned classification or accuracy.</p>
  </section>;
}

const range = value => value.min === null ? 'No completed engine searches' : `${value.min === value.max ? value.min : `${value.min}–${value.max}`} (${value.searches} completed searches)`;
export function ReviewProvenance({ review }) {
  const generation = review.generation, depths = reviewDepthSummary(review);
  if (!generation) return <p className="review-provenance-empty">Run a review to record its settings, source identity and actual depths.</p>;
  return <details className="review-provenance" data-generation-id={generation.id} data-policy={generation.policy.id}>
    <summary>Review provenance and reached depths</summary>
    <dl>
      <dt>Review generation</dt><dd><code>{generation.id}</code></dd>
      <dt>Game session</dt><dd><code>{generation.game.id}</code></dd>
      <dt>Original game SHA-256</dt><dd><code>{generation.game.signature || 'Computing fingerprint…'}</code></dd>
      <dt>Source</dt><dd>{generation.game.provider || 'Local PGN/FEN'}{generation.game.providerGameId ? ` · ${generation.game.providerGameId}` : ''}</dd>
      <dt>Engine</dt><dd>{generation.engine.name} · {generation.engine.version} · {generation.engine.variant}</dd>
      <dt>Worker / WASM SHA-256</dt><dd><code>{generation.engine.workerSha256}</code><code>{generation.engine.wasmSha256}</code></dd>
      <dt>Review policy</dt><dd>{generation.policy.label} · {generation.policy.version}</dd>
      <dt>Target / time limits</dt><dd>Depth {generation.policy.targetDepth}; {generation.policy.positionMs} ms position; {generation.policy.sacrificeMs} ms acceptance</dd>
      <dt>Reached position depths</dt><dd className="reached-position-depths">{range(depths.positions)}; {depths.positions.belowTarget} below target; {depths.positions.rules} rules-derived outcomes</dd>
      <dt>Reached acceptance depths</dt><dd className="reached-acceptance-depths">{range(depths.acceptances)}; {depths.acceptances.belowTarget} below target; {depths.acceptances.rules} rules-derived outcomes</dd>
      <dt>Reached verification depths</dt><dd>{range(depths.verification)}; {depths.verification.belowTarget} below target; {depths.unresolved} unresolved move rechecks</dd>
      <dt>Coverage / state</dt><dd>{review.done} / {review.total} plies · {generation.status}{review.done < review.total ? ' · partial' : ''}</dd>
      <dt>Started (UTC)</dt><dd><time dateTime={generation.createdAt}>{generation.createdAt}</time></dd>
      <dt>Updated (UTC)</dt><dd><time dateTime={generation.updatedAt}>{generation.updatedAt}</time></dd>
      <dt>Completed (UTC)</dt><dd>{generation.completedAt ? <time dateTime={generation.completedAt}>{generation.completedAt}</time> : 'Not completed'}</dd>
      <dt>Resumes</dt><dd>{generation.resumeCount} within this game/settings generation</dd>
      <dt>Scoring versions</dt><dd>{generation.classifierVersion} · {generation.accuracyVersion}</dd>
    </dl>
    <p className="subtle-note">Depths are actual completed engine outputs, not selected targets. Rules-derived checkmate/draw outcomes have no search depth; claimable draws are identified separately in move evidence. Compatible checkpoints are saved in this browser when storage is available. Save failures leave current evidence in memory and available for export.</p>
  </details>;
}

export function MoveReviewEvidence({ record }) {
  if (!record?.provenance) return null;
  const provenance = record.provenance, sacrifice = record.sacrificeCheck;
  return <details className="move-review-evidence" data-generation-id={provenance.generationId}>
    <summary>Evidence for this move</summary>
    <dl>
      <dt>{provenance.scope === 'variation' ? 'Branch ply / mover' : 'Original ply / mover'}</dt><dd>{provenance.scope === 'variation' ? provenance.branchPly : provenance.ply} · {provenance.color === 'w' ? 'White' : 'Black'} · {provenance.san}</dd>
      {provenance.scope === 'variation' && <><dt>Branch point</dt><dd>After original ply {provenance.branchBasePly}. Separate exploration evidence; excluded from the game report.</dd></>}
      <dt>Before</dt><dd>{evaluationDepthLabel(record.before)}</dd>
      <dt>After</dt><dd>{evaluationDepthLabel(record.after)}</dd>
      <dt>Judgment</dt><dd>{record.provisional ? 'Provisional bounded-search evidence' : 'Reviewed at recorded search limits'}</dd>
      <dt>Legal moves before</dt><dd>{record.legalMovesCount ?? 'Not recorded'}</dd>
      {(record.after.claims?.threefold || record.after.claims?.fiftyMove) && <><dt>Draw claim available</dt><dd>{record.after.claims.threefold ? 'Threefold repetition. ' : ''}{record.after.claims.fiftyMove ? 'Fifty-move rule. ' : ''}Availability does not establish that a claim occurred.</dd></>}
      {record.recheck && <><dt>Root verification</dt><dd>{record.recheck.status}; initial loss {record.recheck.initialLoss.toFixed(2)} pp → refined {record.recheck.refinedLoss.toFixed(2)} pp</dd><dt>Best / played root searches</dt><dd>{evaluationDepthLabel(record.recheck.best)} / {evaluationDepthLabel(record.recheck.played)}; {record.recheck.best.elapsedMs + record.recheck.played.elapsedMs} ms</dd></>}
      <dt>Sacrifice check</dt><dd>{sacrifice.status.replaceAll('-', ' ')}</dd>
      {sacrifice.candidate && <><dt>Legal acceptance</dt><dd>{sacrifice.candidate.san} · {sacrifice.candidate.cost} material points at risk</dd><dt>Acceptance evidence</dt><dd>{evaluationDepthLabel(sacrifice.evaluation)}</dd></>}
      <dt>Recorded policy</dt><dd>{provenance.policy.label} · target {provenance.policy.targetDepth}</dd>
      <dt>Generation</dt><dd><code>{provenance.generationId}</code></dd>
      <dt>Reviewed (UTC)</dt><dd><time dateTime={provenance.reviewedAt}>{provenance.reviewedAt}</time></dd>
    </dl>
  </details>;
}
