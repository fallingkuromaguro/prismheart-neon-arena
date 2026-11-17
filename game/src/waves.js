// The ten waves of the night and the director that runs them. Each wave is a list of groups (a
// kind, how many, how far apart, when the first comes); foes arrive from the arena's rim after a
// warning marker, never on top of the Warden.
import { ARENA, PALETTE } from './config.js';
import { dist2 } from './math.js';
import { spawnEnemy } from './enemies.js';
import { spawnBoss } from './boss.js';
import { emit } from './combat.js';

export const WAVES = [
  { name: 'First Light', groups: [['mote', 12, 0.8, 1], ['mote', 8, 0.4, 9]] },
  { name: 'Needles', groups: [['mote', 14, 0.6, 1], ['dart', 6, 1.9, 3]] },
  { name: 'Hungry Dark', groups: [['mote', 16, 0.5, 1], ['leech', 6, 2, 2.5], ['dart', 5, 2.4, 5]] },
  { name: 'Heavy Bloom', groups: [['splitter', 5, 3.2, 1], ['weaver', 4, 3.4, 3], ['mote', 14, 0.6, 2]] },
  { name: 'The Shardmother', boss: 'shardmother', groups: [['mote', 10, 2.2, 6], ['leech', 4, 6, 10], ['dart', 3, 7, 14]] },
  { name: 'Crossfire', groups: [['weaver', 7, 1.8, 1], ['dart', 9, 1.3, 3], ['mote', 16, 0.45, 2]] },
  { name: 'Parasites', groups: [['leech', 12, 1.1, 1], ['splitter', 5, 2.8, 3], ['mote', 16, 0.4, 4]] },
  { name: 'Storm Front', groups: [['dart', 14, 0.9, 1], ['weaver', 7, 2, 2], ['splitter', 5, 2.5, 5], ['mote', 22, 0.35, 1]] },
  { name: 'Hollow Tide', groups: [['splitter', 7, 2, 1], ['leech', 8, 1.5, 2], ['weaver', 7, 1.7, 3], ['dart', 11, 1.05, 4], ['mote', 24, 0.32, 1]] },
  { name: 'The Null Choir', boss: 'choir', groups: [['mote', 12, 2, 5], ['leech', 4, 8, 12]] },
];

const WARNING_TIME = 0.85;

/** Lay out a wave's arrivals as a time-ordered queue. */
export function startWave(state, index) {
  const wave = WAVES[index];
  const queue = [];
  for (const [type, count, every, delay] of wave.groups) {
    for (let i = 0; i < count; i += 1) queue.push({ type, at: delay + i * every + state.rng.next() * every * 0.4 });
  }
  if (wave.boss) queue.push({ type: 'boss', boss: wave.boss, at: 1.8 });
  queue.sort((a, b) => a.at - b.at);
  state.waveIndex = index;
  state.waveTime = 0;
  state.queue = queue;
  state.waveTotal = queue.length + wave.groups.filter((g) => g[0] === 'splitter').reduce((n, g) => n + g[1] * 3, 0);
  state.phase = 'fight';
  state.boss = null;
  emit(state, 'waveStart', { index, name: wave.name, boss: Boolean(wave.boss) });
}

/** A rim point well away from the Warden, where the next foe will come in. */
function rimPoint(state) {
  const rng = state.rng;
  const p = state.player;
  let best = null;
  for (let tries = 0; tries < 8; tries += 1) {
    const side = rng.int(4);
    const t = rng.next();
    const inset = 34;
    const x = side < 2 ? ARENA.left + inset + t * (ARENA.right - ARENA.left - inset * 2) : side === 2 ? ARENA.left + inset : ARENA.right - inset;
    const y = side >= 2 ? ARENA.top + inset + t * (ARENA.bottom - ARENA.top - inset * 2) : side === 0 ? ARENA.top + inset : ARENA.bottom - inset;
    best = { x, y };
    if (dist2(x, y, p.x, p.y) > 260 * 260) break;
  }
  return best;
}

export function updateWave(state, dt) {
  state.waveTime += dt;
  while (state.queue.length > 0 && state.queue[0].at <= state.waveTime) {
    const next = state.queue.shift();
    if (next.type === 'boss') {
      spawnBoss(state, next.boss);
      continue;
    }
    const at = rimPoint(state);
    state.warnings.push({ x: at.x, y: at.y, type: next.type, t: 0 });
  }
  for (let i = state.warnings.length - 1; i >= 0; i -= 1) {
    const w = state.warnings[i];
    w.t += dt;
    if (w.t >= WARNING_TIME) {
      spawnEnemy(state, w.type, w.x, w.y);
      state.warnings.splice(i, 1);
    }
  }
}

/** True once every arrival has come in and every foe is gone. */
export function waveCleared(state) {
  return state.queue.length === 0 && state.warnings.length === 0 && state.enemies.length === 0;
}

/** How much of the wave is still to beat, 0..1, for the HUD's progress bar. */
export function waveRemaining(state) {
  if (state.boss && !state.boss.dead) return state.boss.hp / state.boss.maxHp;
  const left = state.queue.length + state.warnings.length + state.enemies.length;
  return Math.min(1, left / Math.max(1, state.waveTotal));
}

export const WARN_COLOR = PALETTE.danger;
export { WARNING_TIME };
