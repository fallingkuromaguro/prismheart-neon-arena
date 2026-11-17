// The Prismheart: the crystal everything fights over. It beats (a ripple across the floor), its
// Pulse, charged by shards, sends out a shockwave that hurts and hurls foes and wipes their shots,
// and with Heart Sentry it fires at whatever comes close.
import { HEART, PALETTE, PLAYER, PULSE } from './config.js';
import { damageEnemy, emit } from './combat.js';
import { burst, flash, ring, shake } from './fx.js';
import { gridImpulse } from './grid.js';
import { dist2 } from './math.js';

export function createHeart() {
  return { x: HEART.x, y: HEART.y, radius: HEART.radius, hp: HEART.hp, maxHp: HEART.hp, charge: 0, flash: 0, beat: 0, sentryCd: 1, wave: null };
}

export function releasePulse(state) {
  const h = state.heart;
  if (h.charge < 1 || h.wave) return false;
  h.charge = 0;
  h.wave = { r: 0, hit: new Set() };
  state.pulses += 1;
  ring(state, h.x, h.y, PALETTE.heartCore, PULSE.radius, 0.55, 14);
  ring(state, h.x, h.y, PALETTE.heart, PULSE.radius * 0.8, 0.7, 6);
  burst(state, h.x, h.y, PALETTE.heart, 60, 700, 4, 0.8);
  shake(state, 0.7);
  flash(state, PALETTE.heart, 0.35);
  gridImpulse(state.grid, h.x, h.y, 2400, PULSE.radius);
  emit(state, 'pulse');
  return true;
}

export function updateHeart(state, dt) {
  const h = state.heart;
  h.flash = Math.max(0, h.flash - dt);
  h.beat += dt;
  // Faster heartbeat as the Heart weakens: the floor itself tells you it is in danger.
  const period = 0.7 + 0.9 * (h.hp / h.maxHp);
  if (h.beat >= period) {
    h.beat = 0;
    gridImpulse(state.grid, h.x, h.y, h.hp < h.maxHp * 0.35 ? 260 : 150, 120);
  }
  if (h.wave) {
    h.wave.r += PULSE.speed * dt;
    const r2 = h.wave.r * h.wave.r;
    for (const e of state.enemies) {
      if (e.dead || h.wave.hit.has(e.id)) continue;
      if (dist2(e.x, e.y, h.x, h.y) < r2) {
        h.wave.hit.add(e.id);
        e.latched = false;
        damageEnemy(state, e, PULSE.damage * state.stats.pulseDamage, Math.atan2(e.y - h.y, e.x - h.x), PULSE.knock);
      }
    }
    for (let i = state.enemyShots.length - 1; i >= 0; i -= 1) {
      const s = state.enemyShots[i];
      if (dist2(s.x, s.y, h.x, h.y) < r2) {
        burst(state, s.x, s.y, s.color, 2, 100, 2, 0.25);
        state.enemyShots.splice(i, 1);
      }
    }
    if (h.wave.r >= PULSE.radius) h.wave = null;
  }
  const level = state.stats.turret;
  if (level > 0) {
    h.sentryCd -= dt;
    if (h.sentryCd <= 0) {
      let target = null;
      let best = HEART.turretRange * HEART.turretRange;
      for (const e of state.enemies) {
        const d = dist2(e.x, e.y, h.x, h.y);
        if (!e.dead && d < best) {
          best = d;
          target = e;
        }
      }
      if (target) {
        h.sentryCd = HEART.turretInterval / level;
        const a = Math.atan2(target.y - h.y, target.x - h.x);
        state.bullets.push({ x: h.x + Math.cos(a) * h.radius, y: h.y + Math.sin(a) * h.radius, vx: Math.cos(a) * 700, vy: Math.sin(a) * 700, life: 0.7, damage: 1.5 + level * 0.5, pierce: 0, hits: [], color: PALETTE.heart, r: PLAYER.bulletRadius + 1 });
        emit(state, 'sentry');
      } else {
        h.sentryCd = 0.2;
      }
    }
  }
}
