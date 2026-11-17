// The Hollow: five kinds of foe, each with one clear habit the player learns to read.
//   mote      drifts at the Heart (or at you) and bursts against it
//   dart      stalks you, stops to aim (a red line shows where), then lunges
//   splitter  a slow heavy hexagon that cracks into three motes
//   weaver    circles you at range and lobs three-orb volleys
//   leech     latches onto the Heart and drains it until shot off
import { ARENA, LIMITS, PALETTE } from './config.js';
import { clamp, TAU, towards } from './math.js';
import { damageHeart, damagePlayer, fireEnemyShot, killEnemy } from './combat.js';
import { updateBoss } from './boss.js';
import { burst } from './fx.js';

export const ENEMY_TYPES = {
  mote: { hp: 2, radius: 11, speed: 116, score: 10, shards: 1, heartDamage: 5, mass: 1, color: PALETTE.mote },
  dart: { hp: 3, radius: 13, speed: 165, score: 25, shards: 2, heartDamage: 4, mass: 1, color: PALETTE.dart },
  splitter: { hp: 13, radius: 26, speed: 50, score: 45, shards: 4, heartDamage: 14, mass: 3.5, color: PALETTE.splitter },
  weaver: { hp: 6, radius: 16, speed: 140, score: 35, shards: 2, heartDamage: 4, mass: 1.5, color: PALETTE.weaver },
  leech: { hp: 5, radius: 14, speed: 128, score: 30, shards: 2, heartDamage: 0, mass: 1, color: PALETTE.leech },
  boss: { hp: 1, radius: 56, speed: 60, score: 2500, shards: 30, heartDamage: 0, mass: 12, color: PALETTE.boss },
};

const DART = { seek: 1.4, aim: 0.6, lunge: 0.42, lungeSpeed: 840, standoff: 250 };
const WEAVER = { orbit: 290, cooldown: 2.3, tell: 0.45, shotSpeed: 235, spread: 0.24 };
const LEECH_DRAIN = 6;

export function spawnEnemy(state, type, x, y) {
  if (state.enemies.length >= LIMITS.enemies) return null;
  const def = ENEMY_TYPES[type];
  const toughness = 1 + 0.1 * state.waveIndex;
  const e = {
    id: state.nextId++, type, x, y, vx: 0, vy: 0, kx: 0, ky: 0,
    hp: Math.ceil(def.hp * toughness), maxHp: Math.ceil(def.hp * toughness),
    r: def.radius, mass: def.mass, color: def.color, t: 0, flash: 0, dead: false,
    mode: 'seek', timer: 0.6 + state.rng.next() * DART.seek, angle: state.rng.next() * TAU,
    spin: state.rng.sign() * (1 + state.rng.next()), orbitDir: state.rng.sign(),
    huntsPlayer: type === 'dart' || type === 'weaver' || state.rng.chance(type === 'mote' ? 0.3 : 0),
    latched: false, latchAngle: 0, cooldown: 1 + state.rng.next() * WEAVER.cooldown, dashHit: -1, orbitCd: 0,
  };
  state.enemies.push(e);
  return e;
}

/** Steer velocity toward a wanted one: `accel` is how quickly, per second, it gets there. */
function steer(e, wantX, wantY, accel, dt) {
  const k = Math.min(1, accel * dt);
  e.vx += (wantX - e.vx) * k;
  e.vy += (wantY - e.vy) * k;
}

function seekPoint(e, x, y, speed, accel, dt) {
  const d = towards(e.x, e.y, x, y);
  steer(e, d.x * speed, d.y * speed, accel, dt);
  return d;
}

function updateMote(state, e, dt) {
  const target = e.huntsPlayer ? state.player : state.heart;
  const d = seekPoint(e, target.x, target.y, ENEMY_TYPES.mote.speed, 2.6, dt);
  // A sideways wobble so a swarm reads as alive rather than as a conveyor belt.
  const w = Math.sin(e.t * 4 + e.id) * 40;
  e.vx += -d.y * w * dt * 3;
  e.vy += d.x * w * dt * 3;
}

function updateDart(state, e, dt) {
  const p = state.player;
  e.timer -= dt;
  if (e.mode === 'seek') {
    const d = towards(p.x, p.y, e.x, e.y);
    const tx = p.x + d.x * DART.standoff;
    const ty = p.y + d.y * DART.standoff;
    seekPoint(e, tx, ty, ENEMY_TYPES.dart.speed, 3, dt);
    e.angle = Math.atan2(p.y - e.y, p.x - e.x);
    if (e.timer <= 0) {
      e.mode = 'aim';
      e.timer = DART.aim;
    }
  } else if (e.mode === 'aim') {
    steer(e, 0, 0, 8, dt);
    if (e.timer > DART.aim * 0.35) e.angle = Math.atan2(p.y - e.y, p.x - e.x);
    if (e.timer <= 0) {
      e.mode = 'lunge';
      e.timer = DART.lunge;
      state.events.push({ type: 'lunge' });
    }
  } else {
    e.vx = Math.cos(e.angle) * DART.lungeSpeed;
    e.vy = Math.sin(e.angle) * DART.lungeSpeed;
    if (e.timer <= 0) {
      e.mode = 'seek';
      e.timer = DART.seek * (0.7 + state.rng.next() * 0.6);
    }
  }
}

function updateSplitter(state, e, dt) {
  seekPoint(e, state.heart.x, state.heart.y, ENEMY_TYPES.splitter.speed, 1.2, dt);
  e.angle += e.spin * 0.6 * dt;
}

function updateWeaver(state, e, dt) {
  const p = state.player;
  const a = Math.atan2(e.y - p.y, e.x - p.x) + e.orbitDir * 0.55;
  const tx = clamp(p.x + Math.cos(a) * WEAVER.orbit, ARENA.left + 40, ARENA.right - 40);
  const ty = clamp(p.y + Math.sin(a) * WEAVER.orbit, ARENA.top + 40, ARENA.bottom - 40);
  seekPoint(e, tx, ty, ENEMY_TYPES.weaver.speed, 2.2, dt);
  e.angle += dt * 2.4;
  e.cooldown -= dt;
  if (e.cooldown <= 0) {
    e.cooldown = WEAVER.cooldown * (0.85 + state.rng.next() * 0.3);
    const aim = Math.atan2(p.y - e.y, p.x - e.x);
    for (let i = -1; i <= 1; i += 1) fireEnemyShot(state, e.x, e.y, aim + i * WEAVER.spread, WEAVER.shotSpeed, 7);
    burst(state, e.x, e.y, e.color, 8, 160, 2.4, 0.3);
    state.events.push({ type: 'enemyShot' });
  }
}

function updateLeech(state, e, dt) {
  const h = state.heart;
  if (e.latched) {
    e.latchAngle += dt * 0.35;
    e.x = h.x + Math.cos(e.latchAngle) * (h.radius + e.r - 2);
    e.y = h.y + Math.sin(e.latchAngle) * (h.radius + e.r - 2);
    e.vx = 0;
    e.vy = 0;
    e.kx = 0;
    e.ky = 0;
    damageHeart(state, LEECH_DRAIN * dt, e.x, e.y);
    return;
  }
  const d = seekPoint(e, h.x, h.y, ENEMY_TYPES.leech.speed, 2.4, dt);
  e.angle = Math.atan2(d.y, d.x);
  if (d.d < h.radius + e.r + 2) {
    e.latched = true;
    e.latchAngle = Math.atan2(e.y - h.y, e.x - h.x);
    state.events.push({ type: 'latch' });
  }
}

const BEHAVIOURS = { mote: updateMote, dart: updateDart, splitter: updateSplitter, weaver: updateWeaver, leech: updateLeech, boss: updateBoss };

export function updateEnemies(state, dt) {
  const list = state.enemies;
  const p = state.player;
  const h = state.heart;
  for (let i = 0; i < list.length; i += 1) {
    const e = list[i];
    if (e.dead) continue;
    e.t += dt;
    e.flash = Math.max(0, e.flash - dt);
    e.orbitCd = Math.max(0, e.orbitCd - dt);
    BEHAVIOURS[e.type](state, e, dt);
    if (e.latched) continue;
    // Keep a little room between foes so a crowd spreads into a readable shape.
    for (let j = i + 1; j < list.length; j += 1) {
      const o = list[j];
      if (o.dead || o.latched) continue;
      const dx = e.x - o.x;
      const dy = e.y - o.y;
      const min = e.r + o.r;
      const d2 = dx * dx + dy * dy;
      if (d2 < min * min && d2 > 0.01) {
        const d = Math.sqrt(d2);
        const push = ((min - d) / d) * 0.5;
        const we = o.mass / (e.mass + o.mass);
        e.x += dx * push * we;
        e.y += dy * push * we;
        o.x -= dx * push * (1 - we);
        o.y -= dy * push * (1 - we);
      }
    }
    const k = Math.max(0, 1 - 5 * dt);
    e.kx *= k;
    e.ky *= k;
    e.x += (e.vx + e.kx) * dt;
    e.y += (e.vy + e.ky) * dt;
    if (e.t > 1.2 || e.type === 'boss') {
      e.x = clamp(e.x, ARENA.left + e.r, ARENA.right - e.r);
      e.y = clamp(e.y, ARENA.top + e.r, ARENA.bottom - e.r);
    }
    // Ramming the Heart: motes and the like spend themselves on it.
    const def = ENEMY_TYPES[e.type];
    if (def.heartDamage > 0) {
      const hd = h.radius + e.r;
      if ((e.x - h.x) ** 2 + (e.y - h.y) ** 2 < hd * hd) {
        damageHeart(state, def.heartDamage, e.x, e.y);
        killEnemy(state, e, false);
        continue;
      }
    }
    const pd = p.radius + e.r * 0.85;
    if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 < pd * pd) damagePlayer(state, 1, e.x, e.y);
  }
  for (let i = list.length - 1; i >= 0; i -= 1) if (list[i].dead) list.splice(i, 1);
}
