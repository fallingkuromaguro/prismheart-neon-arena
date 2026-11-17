// Visual feedback that lives in the world state (so ?shot= scenes replay it exactly): particles,
// shockwave rings, floating score text, screen-shake trauma and hit-stop.
import { LIMITS } from './config.js';
import { TAU } from './math.js';

export function createFx() {
  return { particles: [], rings: [], texts: [], trauma: 0, hitstop: 0, flash: 0, flashColor: '#ffffff' };
}

/** A radial burst of glowing dots: explosions, hits, pickups. */
export function burst(state, x, y, color, count, speed, size = 3, life = 0.6) {
  const fx = state.fx;
  const rng = state.rng;
  for (let i = 0; i < count && fx.particles.length < LIMITS.particles; i += 1) {
    const a = rng.next() * TAU;
    const s = speed * (0.25 + rng.next() * 0.9);
    fx.particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: life * (0.6 + rng.next() * 0.6), max: life, size: size * (0.6 + rng.next() * 0.8),
      color, drag: 3.2, streak: false,
    });
  }
}

/** Fast streaking sparks thrown in a cone around `angle`: bullet impacts and thrusters. */
export function sparks(state, x, y, color, count, angle, cone, speed, life = 0.3) {
  const fx = state.fx;
  const rng = state.rng;
  for (let i = 0; i < count && fx.particles.length < LIMITS.particles; i += 1) {
    const a = angle + (rng.next() - 0.5) * cone;
    const s = speed * (0.4 + rng.next() * 0.8);
    fx.particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: life * (0.5 + rng.next() * 0.7), max: life, size: 1.6 + rng.next() * 1.4,
      color, drag: 5, streak: true,
    });
  }
}

export function ring(state, x, y, color, maxRadius, life = 0.45, width = 4) {
  state.fx.rings.push({ x, y, color, r: 0, maxRadius, life, max: life, width });
}

export function floatText(state, x, y, text, color, size = 16) {
  if (state.fx.texts.length > 40) state.fx.texts.shift();
  state.fx.texts.push({ x, y, text, color, size, life: 0.9, max: 0.9 });
}

export function shake(state, amount) {
  state.fx.trauma = Math.min(1, state.fx.trauma + amount);
}

export function hitstop(state, seconds) {
  state.fx.hitstop = Math.max(state.fx.hitstop, seconds);
}

export function flash(state, color, amount) {
  state.fx.flash = Math.max(state.fx.flash, amount);
  state.fx.flashColor = color;
}

export function updateFx(state, dt) {
  const fx = state.fx;
  fx.trauma = Math.max(0, fx.trauma - dt * 1.6);
  fx.flash = Math.max(0, fx.flash - dt * 2.5);
  const ps = fx.particles;
  for (let i = ps.length - 1; i >= 0; i -= 1) {
    const p = ps[i];
    p.life -= dt;
    if (p.life <= 0) {
      ps[i] = ps[ps.length - 1];
      ps.pop();
      continue;
    }
    const k = Math.max(0, 1 - p.drag * dt);
    p.vx *= k;
    p.vy *= k;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  for (let i = fx.rings.length - 1; i >= 0; i -= 1) {
    const r = fx.rings[i];
    r.life -= dt;
    r.r = r.maxRadius * (1 - Math.pow(r.life / r.max, 2.2));
    if (r.life <= 0) fx.rings.splice(i, 1);
  }
  for (let i = fx.texts.length - 1; i >= 0; i -= 1) {
    const t = fx.texts[i];
    t.life -= dt;
    t.y -= 38 * dt;
    if (t.life <= 0) fx.texts.splice(i, 1);
  }
}
