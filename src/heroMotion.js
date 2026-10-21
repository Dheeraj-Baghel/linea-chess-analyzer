// Continuous, delta-time motion. Scroll changes angular velocity, never resets
// orientation to a progress-derived angle. Reverse must overcome gentle idle spin.
// Idle (no-scroll) spin in rad/s: ~1 revolution per 70 s (was 0.06 = ~105 s, originally 0.025).
export const IDLE_SPEED = 0.09;
export function advanceHeroMotion(state, delta) {
  const dt = Math.max(0, Math.min(0.05, Number.isFinite(delta) ? delta : 0));
  const impulse = (Number.isFinite(state.impulse) ? state.impulse : 0) * Math.exp(-dt * 3.2);
  const target = Math.abs(impulse) > 4 ? Math.sign(impulse) * Math.max(0.18, Math.min(1.25, Math.abs(impulse) * 0.0012)) : IDLE_SPEED;
  const speed = state.speed + (target - state.speed) * (1 - Math.exp(-dt * 9));
  return { angle: state.angle + speed * dt, speed: Math.max(-1.25, Math.min(1.25, speed)), impulse };
}
