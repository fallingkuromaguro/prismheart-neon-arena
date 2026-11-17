// What happens when things hurt each other: damage, deaths, shard drops, the combo and score, and
// the events the game loop turns into sound and announcements. Movement lives elsewhere.
import { COMBO, LIMITS, PALETTE, SCORE } from './config.js';
import { burst, floatText, flash, hitstop, ring, shake, sparks } from './fx.js';
import { gridImpulse } from './grid.js';
import { TAU } from './math.js';
import { ENEMY_TYPES, spawnEnemy } from './enemies.js';

export function emit(state, type, data = {}) {
  if (state.events.length < 64) state.events.push({ type, ...data });
}

export function comboMultiplier(state) {
  return Math.min(COMBO.maxMult, 1 + Math.floor(state.combo / COMBO.killsPerStep));
}

export function addScore(state, base, x, y, color) {
  const mult = comboMultiplier(state);
  const points = Math.round(base * mult);
  state.score += points;
  if (x !== undefined) floatText(state, x, y, mult > 1 ? `${points} ×${mult}` : `${points}`, color, mult > 1 ? 17 : 14);
  return points;
}

/** Hurt an enemy; returns true when the hit killed it. */
export function damageEnemy(state, e, amount, angle, knock = 120) {
  if (e.dead || e.shielded) return false;
  e.hp -= amount;
  e.flash = 0.08;
  const mass = e.mass ?? 1;
  e.kx += (Math.cos(angle) * knock) / mass;
  e.ky += (Math.sin(angle) * knock) / mass;
  sparks(state, e.x - Math.cos(angle) * e.r * 0.6, e.y - Math.sin(angle) * e.r * 0.6, e.color, 3, angle + Math.PI, 1.6, 260);
  if (e.hp <= 0) {
    killEnemy(state, e, true);
    return true;
  }
  emit(state, 'hit');
  return false;
}

export function killEnemy(state, e, byPlayer) {
  if (e.dead) return;
  e.dead = true;
  const big = e.type === 'splitter' || e.type === 'boss';
  burst(state, e.x, e.y, e.color, big ? 46 : 20, big ? 520 : 360, big ? 4.5 : 3.2, big ? 0.9 : 0.6);
  burst(state, e.x, e.y, '#ffffff', big ? 12 : 5, 220, 2.2, 0.35);
  ring(state, e.x, e.y, e.color, e.r * (big ? 5 : 3.4), big ? 0.6 : 0.35, big ? 6 : 3);
  gridImpulse(state.grid, e.x, e.y, big ? 900 : 380, big ? 200 : 110);
  shake(state, big ? 0.35 : 0.1);
  if (big) hitstop(state, 0.05);
  if (byPlayer) {
    state.kills += 1;
    state.combo += 1;
    state.comboTimer = COMBO.window;
    state.bestCombo = Math.max(state.bestCombo, state.combo);
    addScore(state, ENEMY_TYPES[e.type]?.score ?? 0, e.x, e.y - e.r, PALETTE.text);
    dropShards(state, e.x, e.y, ENEMY_TYPES[e.type]?.shards ?? 1);
  }
  if (e.type === 'splitter') {
    for (let i = 0; i < 3; i += 1) {
      const a = (i / 3) * TAU + state.rng.next();
      const child = spawnEnemy(state, 'mote', e.x + Math.cos(a) * 14, e.y + Math.sin(a) * 14);
      if (child) {
        child.kx = Math.cos(a) * 260;
        child.ky = Math.sin(a) * 260;
      }
    }
  }
  emit(state, big ? 'bigKill' : 'kill', { combo: state.combo });
}

export function dropShards(state, x, y, count) {
  for (let i = 0; i < count; i += 1) {
    const a = state.rng.next() * TAU;
    const s = 60 + state.rng.next() * 140;
    state.shards.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, age: 0, spin: state.rng.next() * TAU });
  }
}

export function damagePlayer(state, amount, fromX, fromY) {
  const p = state.player;
  if (p.invulnerable > 0 || p.dashTime > 0 || state.phase !== 'fight') return;
  p.hull = Math.max(0, p.hull - amount);
  p.invulnerable = 1.3;
  state.combo = 0;
  state.comboTimer = 0;
  state.hitsTaken += 1;
  const a = Math.atan2(p.y - fromY, p.x - fromX);
  p.vx += Math.cos(a) * 420;
  p.vy += Math.sin(a) * 420;
  burst(state, p.x, p.y, PALETTE.player, 26, 380, 3, 0.6);
  ring(state, p.x, p.y, PALETTE.danger, 90, 0.4, 4);
  shake(state, 0.55);
  hitstop(state, 0.07);
  flash(state, PALETTE.danger, 0.35);
  gridImpulse(state.grid, p.x, p.y, 700, 160);
  emit(state, 'playerHit', { hull: p.hull });
}

export function damageHeart(state, amount, x, y) {
  const h = state.heart;
  if (state.phase !== 'fight' || h.hp <= 0) return;
  h.hp = Math.max(0, h.hp - amount);
  h.flash = 0.18;
  state.heartDamageTaken += amount;
  if (amount >= 3) {
    burst(state, x, y, PALETTE.heart, 10, 240, 2.6, 0.5);
    shake(state, 0.15);
    gridImpulse(state.grid, h.x, h.y, 260, 140);
  }
  emit(state, 'heartHit', { hp: h.hp });
}

export function fireEnemyShot(state, x, y, angle, speed, radius = 6, color = PALETTE.enemyShot) {
  if (state.enemyShots.length >= LIMITS.enemyShots) return;
  state.enemyShots.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r: radius, life: 6, color });
}
