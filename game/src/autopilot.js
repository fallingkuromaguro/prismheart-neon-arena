// A simple pilot that plays the real rules: it flies the title screen's attract demo and stages
// the ?shot= scenes. It orbits the Heart, sidesteps shots and foes, aims at the nearest threat
// with a little lead, dashes out of tight spots and fires the Pulse into a crowd.
import { HEART, PLAYER } from './config.js';
import { clamp, dist2 } from './math.js';

/** `skill` 0..1: how far ahead it looks and how hard it dodges. */
export function autopilot(state, skill = 1) {
  const p = state.player;
  const h = state.heart;
  let target = null;
  let bestScore = Infinity;
  for (const e of state.enemies) {
    if (e.dead) continue;
    // Prefer what threatens the Heart or the Warden most: close to either, leeches first.
    const dp = dist2(e.x, e.y, p.x, p.y);
    const dh = dist2(e.x, e.y, h.x, h.y) * (e.type === 'leech' ? 0.3 : 1);
    const score = Math.min(dp, dh * 1.2) * (e.type === 'boss' ? 1.6 : 1);
    if (score < bestScore) {
      bestScore = score;
      target = e;
    }
  }
  // Orbit the Heart at a working distance, drifting around it.
  const orbitA = Math.atan2(p.y - h.y, p.x - h.x) + 0.6;
  let wantX = h.x + Math.cos(orbitA) * 150 - p.x;
  let wantY = h.y + Math.sin(orbitA) * 120 - p.y;
  let danger = 0;
  const look = 0.18 + 0.3 * skill;
  for (const s of state.enemyShots) {
    const fx = s.x + s.vx * look;
    const fy = s.y + s.vy * look;
    const d2 = dist2(fx, fy, p.x, p.y);
    if (d2 < 90 * 90) {
      const d = Math.sqrt(d2) + 1;
      const push = (90 - d) * 9 * skill;
      wantX += ((p.x - fx) / d) * push;
      wantY += ((p.y - fy) / d) * push;
      if (d < 30) danger += 1;
    }
  }
  for (const e of state.enemies) {
    const d2 = dist2(e.x, e.y, p.x, p.y);
    const keep = e.r + 70 + (e.type === 'dart' && e.mode !== 'seek' ? 60 : 0);
    if (d2 < keep * keep) {
      const d = Math.sqrt(d2) + 1;
      const push = (keep - d) * 7 * skill;
      wantX += ((p.x - e.x) / d) * push;
      wantY += ((p.y - e.y) / d) * push;
      if (d < e.r + 26) danger += 1;
    }
  }
  for (const s of state.shards) {
    if (dist2(s.x, s.y, p.x, p.y) < 200 * 200) {
      wantX += (s.x - p.x) * 0.15;
      wantY += (s.y - p.y) * 0.15;
    }
  }
  const len = Math.hypot(wantX, wantY);
  const moveX = len > 20 ? wantX / len : wantX / 20;
  const moveY = len > 20 ? wantY / len : wantY / 20;
  let aimX = HEART.x;
  let aimY = 0;
  if (target) {
    const d = Math.sqrt(dist2(target.x, target.y, p.x, p.y));
    const t = (d / state.stats.bulletSpeed) * skill;
    // A less skilled pilot aims worse: a wobble that grows as skill drops, as a hurried hand does.
    const wobble = (1 - skill) * 0.5 * Math.sin(state.time * 2.7 + p.x * 0.01);
    const ax = target.x + target.vx * t - p.x;
    const ay = target.y + target.vy * t - p.y;
    aimX = p.x + ax * Math.cos(wobble) - ay * Math.sin(wobble);
    aimY = p.y + ax * Math.sin(wobble) + ay * Math.cos(wobble);
  }
  let crowd = 0;
  for (const e of state.enemies) if (dist2(e.x, e.y, h.x, h.y) < 330 * 330) crowd += e.type === 'boss' ? 6 : 1;
  return {
    moveX: clamp(moveX, -1, 1),
    moveY: clamp(moveY, -1, 1),
    aimX,
    aimY,
    fire: target !== null,
    dash: danger > 0 && skill > 0.5 && p.dashCd <= 0 && p.invulnerable <= 0,
    pulse: h.charge >= 1 && (crowd >= 6 || h.hp < h.maxHp * 0.4),
  };
}

export const PILOT_RADIUS = PLAYER.radius;

const CARD_PRIORITY = ['twin', 'rate', 'orbit', 'turret', 'power', 'pierce', 'pulse', 'magnet', 'hull', 'dash', 'swift', 'mend'];

/** Which offered card the pilot takes: mend when the Heart is hurt, else its favourite build order. */
export function chooseCard(state) {
  const choices = state.choices;
  if (state.heart.hp < state.heart.maxHp * 0.55 && choices.includes('mend')) return choices.indexOf('mend');
  let best = 0;
  for (let i = 1; i < choices.length; i += 1) if (CARD_PRIORITY.indexOf(choices[i]) < CARD_PRIORITY.indexOf(choices[best])) best = i;
  return best;
}
