import { describe, expect, it } from 'vitest';
import { advanceHeroMotion, IDLE_SPEED } from '../../src/heroMotion.js';
const initial = () => ({ angle: .5, speed: IDLE_SPEED, impulse: 0 });
describe('elapsed-time signed hero motion', () => {
  it('rotates slowly at rest and never resets accumulated orientation', () => {
    const state = advanceHeroMotion({ ...initial(), angle: 12 }, 1 / 60); expect(state.angle).toBeGreaterThan(12); expect(state.speed).toBeCloseTo(IDLE_SPEED);
  });
  it('downward scroll adds forward motion; upward scroll visibly defeats idle', () => {
    let down = { ...initial(), impulse: 1000 }, up = { ...initial(), impulse: -1000 };
    for (let i = 0; i < 20; i++) { down = advanceHeroMotion(down, 1 / 60); up = advanceHeroMotion(up, 1 / 60); }
    expect(down.angle).toBeGreaterThan(.6); expect(up.angle).toBeLessThan(.4); expect(up.speed).toBeLessThan(-.1);
  });
  it('caps angular speed and resumed-frame displacement', () => {
    const state = advanceHeroMotion({ angle: 20, speed: 1.25, impulse: 1e8 }, 10); expect(state.speed).toBeLessThanOrEqual(1.25); expect(state.angle - 20).toBeLessThanOrEqual(.06250001);
  });
  it('is nearly frame-rate invariant across 30/60/144 Hz', () => {
    const run = hz => { let state = { ...initial(), impulse: 400 }; for (let i = 0; i < hz * 2; i++) state = advanceHeroMotion(state, 1 / hz); return state.angle; };
    const values = [30, 60, 144].map(run); expect(Math.max(...values) - Math.min(...values)).toBeLessThan(.02);
  });
  it('retains its angle through a change of scroll direction rather than snapping to progress', () => {
    const before = { angle: 31.4, speed: .8, impulse: -900 }, next = advanceHeroMotion(before, 1 / 60); expect(Math.abs(next.angle - before.angle)).toBeLessThan(.025);
  });
});
