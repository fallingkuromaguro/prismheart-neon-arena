// The two great Hollow: the Shardmother (wave 5) and the Null Choir (wave 10). Both circle the
// Heart at a distance and cycle through readable attack patterns; the Choir has three phases,
// each announced by a shockwave that wipes its bullets so the player can breathe.
import { ARENA, HEART, PALETTE } from './config.js';
import { clamp, TAU, towards } from './math.js';
import { emit, fireEnemyShot } from './combat.js';
import { burst, floatText, ring, shake } from './fx.js';
import { gridImpulse } from './grid.js';
import { spawnEnemy } from './enemies.js';

export const BOSSES = {
  shardmother: { name: 'THE SHARDMOTHER', hp: 340, radius: 54, orbit: 270, orbitSpeed: 0.22 },
  choir: { name: 'THE NULL CHOIR', hp: 820, radius: 62, orbit: 280, orbitSpeed: 0.3 },
};

export function spawnBoss(state, kind) {
  const def = BOSSES[kind];
  const e = spawnEnemy(state, 'boss', HEART.x, ARENA.top + 70);
  if (!e) return null;
  e.kind = kind;
  e.hp = def.hp;
  e.maxHp = def.hp;
  e.r = def.radius;
  e.phase = 1;
  e.cooldown = 2.2;
  e.pattern = 0;
  e.spiral = 0;
  e.charge = 0;
  e.shielded = false;
  e.shieldTime = 0;
  e.orbitAngle = -Math.PI / 2;
  state.boss = e;
  emit(state, 'bossSpawn', { name: def.name });
  shake(state, 0.6);
  gridImpulse(state.grid, e.x, e.y, 1200, 320);
  return e;
}

function ringVolley(state, e, count, speed, offset = 0) {
  for (let i = 0; i < count; i += 1) fireEnemyShot(state, e.x, e.y, offset + (i / count) * TAU, speed, 7);
  ring(state, e.x, e.y, e.color, e.r * 2.6, 0.4, 5);
  emit(state, 'bossShot');
}

function aimedFan(state, e, count, spread, speed) {
  const aim = Math.atan2(state.player.y - e.y, state.player.x - e.x);
  for (let i = 0; i < count; i += 1) fireEnemyShot(state, e.x, e.y, aim + (i - (count - 1) / 2) * spread, speed, 6);
  emit(state, 'bossShot');
}

function brood(state, e, type, count) {
  for (let i = 0; i < count; i += 1) {
    const a = state.rng.next() * TAU;
    const m = spawnEnemy(state, type, e.x + Math.cos(a) * e.r, e.y + Math.sin(a) * e.r);
    if (m) {
      m.kx = Math.cos(a) * 300;
      m.ky = Math.sin(a) * 300;
    }
  }
  burst(state, e.x, e.y, e.color, 18, 300, 3, 0.5);
}

function updateShardmother(state, e, dt) {
  e.cooldown -= dt;
  if (e.cooldown > 0) return;
  const step = e.pattern % 3;
  if (step === 0) ringVolley(state, e, 18, 190, e.t);
  else if (step === 1) brood(state, e, 'mote', 4);
  else aimedFan(state, e, 5, 0.17, 260);
  e.pattern += 1;
  e.cooldown = e.hp < e.maxHp * 0.5 ? 1.7 : 2.3;
}

/** The Choir's phase from its remaining integrity: 1 above two thirds, 2 above one third, then 3. */
function choirPhase(e) {
  const f = e.hp / e.maxHp;
  return f > 2 / 3 ? 1 : f > 1 / 3 ? 2 : 3;
}

function updateChoir(state, e, dt) {
  const phase = choirPhase(e);
  if (phase !== e.phase) {
    e.phase = phase;
    e.shielded = true;
    e.shieldTime = 1.4;
    state.enemyShots.length = 0;
    ring(state, e.x, e.y, '#ffffff', 520, 0.9, 10);
    shake(state, 0.8);
    gridImpulse(state.grid, e.x, e.y, 1600, 480);
    floatText(state, e.x, e.y - 90, phase === 2 ? 'THE CHOIR SWELLS' : 'THE CHOIR SCREAMS', PALETTE.boss, 26);
    emit(state, 'bossPhase', { phase });
    if (phase === 2) brood(state, e, 'dart', 3);
    if (phase === 3) brood(state, e, 'leech', 3);
    return;
  }
  if (e.shielded) {
    e.shieldTime -= dt;
    if (e.shieldTime <= 0) e.shielded = false;
    return;
  }
  // A constant rotating spiral: two arms, then three, each phase a little faster.
  const arms = phase === 1 ? 2 : 3;
  const rate = phase === 3 ? 0.085 : 0.12;
  e.spiral -= dt;
  if (e.spiral <= 0) {
    e.spiral = rate;
    const base = e.t * (phase === 3 ? 1.9 : 1.3);
    for (let i = 0; i < arms; i += 1) fireEnemyShot(state, e.x, e.y, base + (i / arms) * TAU, 170 + phase * 15, 6, '#ff8fb8');
  }
  e.cooldown -= dt;
  if (e.cooldown > 0) return;
  const step = e.pattern % 3;
  if (step === 0) ringVolley(state, e, 14 + phase * 4, 210, e.t * 0.7);
  else if (step === 1) aimedFan(state, e, 3 + phase * 2, 0.14, 300);
  else brood(state, e, phase === 1 ? 'mote' : phase === 2 ? 'dart' : 'weaver', phase === 3 ? 2 : 4);
  e.pattern += 1;
  e.cooldown = [0, 2.6, 2.1, 1.7][phase];
}

export function updateBoss(state, e, dt) {
  const def = BOSSES[e.kind];
  // Drift down into the arena, then orbit the Heart, breathing in and out.
  e.orbitAngle += def.orbitSpeed * dt;
  const radius = def.orbit + Math.sin(e.t * 0.7) * 50;
  const tx = clamp(HEART.x + Math.cos(e.orbitAngle) * radius * 1.45, ARENA.left + e.r + 10, ARENA.right - e.r - 10);
  const ty = clamp(HEART.y + Math.sin(e.orbitAngle) * radius * 0.85, ARENA.top + e.r + 10, ARENA.bottom - e.r - 10);
  const d = towards(e.x, e.y, tx, ty);
  const speed = Math.min(160, d.d * 1.5);
  e.vx += (d.x * speed - e.vx) * Math.min(1, dt * 2);
  e.vy += (d.y * speed - e.vy) * Math.min(1, dt * 2);
  e.angle += dt * (e.kind === 'choir' ? 0.5 + e.phase * 0.3 : 0.4);
  if (e.t < 1.6) return;
  if (e.kind === 'choir') updateChoir(state, e, dt);
  else updateShardmother(state, e, dt);
}
