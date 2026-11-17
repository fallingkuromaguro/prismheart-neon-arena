// The Warden: flight, dash, the lance it fires, its halo blades, and the shards it gathers.
import { ARENA, PALETTE, PLAYER, PULSE, SCORE } from './config.js';
import { clamp, TAU } from './math.js';
import { addScore, damageEnemy, emit } from './combat.js';
import { burst, ring, shake, sparks } from './fx.js';
import { gridImpulse } from './grid.js';

export function createPlayer(x, y) {
  return { x, y, vx: 0, vy: 0, aim: -Math.PI / 2, hull: PLAYER.hull, invulnerable: 0, fireCd: 0, dashCd: 0, dashTime: 0, dashX: 1, dashY: 0, dashId: 0, recoil: 0, trail: [] };
}

export function updatePlayer(state, input, dt) {
  const p = state.player;
  const s = state.stats;
  p.invulnerable = Math.max(0, p.invulnerable - dt);
  p.fireCd -= dt;
  p.dashCd = Math.max(0, p.dashCd - dt);
  p.recoil = Math.max(0, p.recoil - dt * 8);
  p.aim = Math.atan2(input.aimY - p.y, input.aimX - p.x);

  let mx = input.moveX;
  let my = input.moveY;
  const len = Math.hypot(mx, my);
  if (len > 1) {
    mx /= len;
    my /= len;
  }
  if (input.dash && p.dashCd <= 0) {
    const dirLen = Math.hypot(mx, my);
    p.dashX = dirLen > 0.1 ? mx / dirLen : Math.cos(p.aim);
    p.dashY = dirLen > 0.1 ? my / dirLen : Math.sin(p.aim);
    p.dashTime = PLAYER.dashTime;
    p.dashCd = s.dashCooldown;
    p.dashId += 1;
    burst(state, p.x, p.y, PALETTE.player, 14, 260, 2.4, 0.35);
    gridImpulse(state.grid, p.x, p.y, 300, 90);
    emit(state, 'dash');
  }
  if (p.dashTime > 0) {
    p.dashTime -= dt;
    p.vx = p.dashX * PLAYER.dashSpeed;
    p.vy = p.dashY * PLAYER.dashSpeed;
    if (state.rng.chance(0.9)) p.trail.push({ x: p.x, y: p.y, a: p.aim, life: 0.25 });
    dashStrike(state);
  } else {
    const k = Math.min(1, PLAYER.accel * dt);
    p.vx += (mx * s.moveSpeed - p.vx) * k;
    p.vy += (my * s.moveSpeed - p.vy) * k;
  }
  p.x = clamp(p.x + p.vx * dt, ARENA.left + PLAYER.radius, ARENA.right - PLAYER.radius);
  p.y = clamp(p.y + p.vy * dt, ARENA.top + PLAYER.radius, ARENA.bottom - PLAYER.radius);
  // Keep the Warden out of the Heart itself: it slides around the crystal.
  const h = state.heart;
  const hx = p.x - h.x;
  const hy = p.y - h.y;
  const hd = Math.hypot(hx, hy);
  const minD = h.radius + PLAYER.radius + 4;
  if (hd < minD && hd > 0.01) {
    p.x = h.x + (hx / hd) * minD;
    p.y = h.y + (hy / hd) * minD;
  }
  for (let i = p.trail.length - 1; i >= 0; i -= 1) {
    p.trail[i].life -= dt;
    if (p.trail[i].life <= 0) p.trail.splice(i, 1);
  }
  if (Math.hypot(p.vx, p.vy) > 60 && state.rng.chance(0.5)) {
    sparks(state, p.x - Math.cos(p.aim) * 10, p.y - Math.sin(p.aim) * 10, '#3fb8ff', 1, Math.atan2(-p.vy, -p.vx), 0.6, 120, 0.25);
  }
  if (input.fire && p.fireCd <= 0) fireLance(state);
}

function fireLance(state) {
  const p = state.player;
  const s = state.stats;
  p.fireCd = s.fireInterval;
  p.recoil = 1;
  const n = s.shots;
  for (let i = 0; i < n; i += 1) {
    const a = p.aim + (i - (n - 1) / 2) * PLAYER.spread;
    const ox = p.x + Math.cos(p.aim) * 16;
    const oy = p.y + Math.sin(p.aim) * 16;
    state.bullets.push({ x: ox, y: oy, vx: Math.cos(a) * s.bulletSpeed, vy: Math.sin(a) * s.bulletSpeed, life: PLAYER.bulletLife, damage: s.damage, pierce: s.pierce, hits: [], color: PALETTE.bullet, r: PLAYER.bulletRadius });
  }
  sparks(state, p.x + Math.cos(p.aim) * 18, p.y + Math.sin(p.aim) * 18, PALETTE.bullet, 2, p.aim, 0.7, 240, 0.12);
  emit(state, 'shoot');
}

/** A dash cuts through whatever it passes, once per foe per dash. */
function dashStrike(state) {
  const p = state.player;
  for (const e of state.enemies) {
    if (e.dead || e.dashHit === p.dashId) continue;
    const r = e.r + PLAYER.radius + 6;
    if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 < r * r) {
      e.dashHit = p.dashId;
      damageEnemy(state, e, state.stats.dashDamage, Math.atan2(p.dashY, p.dashX), 380);
      shake(state, 0.12);
    }
  }
}

/** Player shots: fly, hit, pierce, fizzle at the wall. Heart Sentry shots share the same rules. */
export function updateBullets(state, dt) {
  const list = state.bullets;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const b = list[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    let gone = b.life <= 0;
    if (b.x < ARENA.left || b.x > ARENA.right || b.y < ARENA.top || b.y > ARENA.bottom) {
      sparks(state, clamp(b.x, ARENA.left, ARENA.right), clamp(b.y, ARENA.top, ARENA.bottom), b.color, 3, Math.atan2(-b.vy, -b.vx), 1.4, 180, 0.2);
      gone = true;
    }
    if (!gone) {
      for (const e of state.enemies) {
        if (e.dead || b.hits.includes(e.id)) continue;
        const r = e.r + b.r;
        if ((e.x - b.x) ** 2 + (e.y - b.y) ** 2 < r * r) {
          b.hits.push(e.id);
          if (e.shielded) {
            sparks(state, b.x, b.y, '#ffffff', 4, Math.atan2(-b.vy, -b.vx), 1.2, 260, 0.2);
            gone = true;
            break;
          }
          damageEnemy(state, e, b.damage, Math.atan2(b.vy, b.vx), 90);
          if (b.pierce <= 0) {
            gone = true;
            break;
          }
          b.pierce -= 1;
        }
      }
    }
    if (gone) {
      list[i] = list[list.length - 1];
      list.pop();
    }
  }
}

/** Halo Blades: one to three shards of light circling the Warden that cut what they touch. */
export function updateOrbitals(state) {
  const n = state.stats.orbitals;
  if (n === 0) return;
  const p = state.player;
  for (let i = 0; i < n; i += 1) {
    const a = state.time * PLAYER.orbitSpeed + (i / n) * TAU;
    const x = p.x + Math.cos(a) * PLAYER.orbitRadius;
    const y = p.y + Math.sin(a) * PLAYER.orbitRadius;
    for (const e of state.enemies) {
      if (e.dead || e.orbitCd > 0) continue;
      const r = e.r + 9;
      if ((e.x - x) ** 2 + (e.y - y) ** 2 < r * r) {
        e.orbitCd = 0.28;
        damageEnemy(state, e, PLAYER.orbitDamage * (1 + 0.25 * (state.levels.power ?? 0)), a + Math.PI / 2, 160);
      }
    }
  }
}

/** Shards drift, get pulled in by the Warden's magnet, and score and charge the Pulse when taken. */
export function updateShards(state, dt, vacuum) {
  const p = state.player;
  const list = state.shards;
  const reach = vacuum ? 4000 : state.stats.magnet;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const s = list[i];
    s.age += dt;
    s.spin += dt * 3;
    const dx = p.x - s.x;
    const dy = p.y - s.y;
    const d = Math.hypot(dx, dy);
    if (d < reach && s.age > 0.25) {
      const pull = vacuum ? 1400 : 900 * (1 - d / reach) + 300;
      s.vx += (dx / d) * pull * dt * 4;
      s.vy += (dy / d) * pull * dt * 4;
    }
    const k = Math.max(0, 1 - 3 * dt);
    s.vx *= k;
    s.vy *= k;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    if (d < PLAYER.radius + 10 || s.age > 14) {
      if (s.age <= 14) collectShard(state, s);
      list[i] = list[list.length - 1];
      list.pop();
    }
  }
}

function collectShard(state, s) {
  state.shardsTaken += 1;
  addScore(state, SCORE.shard);
  const h = state.heart;
  const before = h.charge;
  h.charge = Math.min(1, h.charge + PULSE.chargePerShard * state.stats.pulseGain);
  burst(state, s.x, s.y, PALETTE.shard, 4, 120, 2, 0.25);
  emit(state, 'shard', { n: state.shardsTaken });
  if (before < 1 && h.charge >= 1) {
    ring(state, h.x, h.y, PALETTE.heart, 120, 0.6, 4);
    emit(state, 'pulseReady');
  }
}
