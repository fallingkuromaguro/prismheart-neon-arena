// The Attunements offered between waves: three cards, pick one. Each has levels; the Warden's and
// the Heart's working numbers are always recomputed from the levels held, never patched in place.
import { HEART, PLAYER } from './config.js';

export const UPGRADES = [
  { id: 'twin', name: 'Split Lance', glyph: '⫶', color: '#4ff7ff', max: 3, text: (l) => `+1 shot per volley (${l + 2} total)` },
  { id: 'rate', name: 'Overclock', glyph: '»', color: '#4ff7ff', max: 4, text: () => '+22% fire rate' },
  { id: 'power', name: 'Dense Core', glyph: '◆', color: '#ff9b6a', max: 4, text: () => '+35% shot damage' },
  { id: 'pierce', name: 'Needle Rounds', glyph: '↣', color: '#ff9b6a', max: 3, text: () => 'Shots pierce +1 foe' },
  { id: 'orbit', name: 'Halo Blades', glyph: '✲', color: '#c9a2ff', max: 3, text: () => '+1 blade circles you' },
  { id: 'dash', name: 'Phase Edge', glyph: '⟿', color: '#c9a2ff', max: 3, text: () => 'Dash recharges 25% faster, cuts harder' },
  { id: 'magnet', name: 'Lodestar', glyph: '◎', color: '#ffc94d', max: 3, text: () => 'Shards fly to you from 60% farther' },
  { id: 'pulse', name: 'Resonance', glyph: '◉', color: '#ffc94d', max: 3, text: () => 'Pulse charges 30% faster, hits harder' },
  { id: 'turret', name: 'Heart Sentry', glyph: '✦', color: '#ffd166', max: 3, text: () => 'The Heart shoots nearby foes' },
  { id: 'mend', name: 'Heart Mend', glyph: '♥', color: '#ffd166', max: 9, text: () => 'Heart +30 integrity, +10 max' },
  { id: 'hull', name: 'Aegis Plating', glyph: '⬢', color: '#6dffb0', max: 3, text: () => '+1 max hull, repair fully' },
  { id: 'swift', name: 'Tailwind', glyph: '➶', color: '#6dffb0', max: 3, text: () => '+12% move and shot speed' },
];

export const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

/** The Warden's working numbers for the levels held. */
export function computeStats(levels) {
  const l = (id) => levels[id] ?? 0;
  const swift = 1 + 0.12 * l('swift');
  return {
    shots: 1 + l('twin'),
    fireInterval: PLAYER.fireInterval / (1 + 0.22 * l('rate')),
    damage: PLAYER.bulletDamage * (1 + 0.35 * l('power')),
    pierce: l('pierce'),
    bulletSpeed: PLAYER.bulletSpeed * swift,
    moveSpeed: PLAYER.speed * swift,
    orbitals: l('orbit'),
    dashCooldown: PLAYER.dashCooldown * Math.pow(0.75, l('dash')),
    dashDamage: PLAYER.dashDamage * (1 + l('dash')),
    magnet: PLAYER.magnet * (1 + 0.6 * l('magnet')),
    pulseGain: 1 + 0.3 * l('pulse'),
    pulseDamage: 1 + 0.4 * l('pulse'),
    turret: l('turret'),
    maxHull: PLAYER.hull + l('hull'),
    heartMax: HEART.hp + 15 * l('mend'),
  };
}

/** Three different cards the player has not maxed out, drawn with the world's generator. */
export function rollChoices(state) {
  const open = UPGRADES.filter((u) => (state.levels[u.id] ?? 0) < u.max);
  const picks = [];
  while (picks.length < 3 && open.length > 0) {
    // A badly hurt Heart makes the mend card far more likely to show up: a lifeline, not a given.
    const weights = open.map((u) => (u.id === 'mend' && state.heart.hp < state.heart.maxHp * 0.5 ? 4 : 1));
    let roll = state.rng.next() * weights.reduce((a, b) => a + b, 0);
    let index = 0;
    while (roll > weights[index]) {
      roll -= weights[index];
      index += 1;
    }
    picks.push(open[index].id);
    open.splice(index, 1);
  }
  return picks;
}

/** Take a card: raise its level, recompute stats and apply its one-off effect. */
export function applyUpgrade(state, id) {
  state.levels[id] = (state.levels[id] ?? 0) + 1;
  state.stats = computeStats(state.levels);
  const p = state.player;
  if (id === 'hull') p.hull = state.stats.maxHull;
  if (id === 'mend') {
    state.heart.maxHp = state.stats.heartMax;
    state.heart.hp = Math.min(state.heart.maxHp, state.heart.hp + 30);
  }
}
