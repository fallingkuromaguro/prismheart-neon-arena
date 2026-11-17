// The overlay screens drawn over the living arena: title, the Attunement choice between waves,
// pause, defeat and victory. Card positions are shared with the loop for mouse picking.
import { PALETTE } from './config.js';
import { clamp, easeOutBack, TAU } from './math.js';
import { glowText, neonStroke, plainText, polygonPath, withAlpha } from './paint.js';
import { UPGRADE_BY_ID } from './upgrades.js';
import { WAVES } from './waves.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_UPGRADE = 'upgrade';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WON = 'won';

const CARD = { w: 290, h: 330, gap: 34, y: 200 };

/** Where the three Attunement cards sit, for drawing and for mouse picking. */
export function cardRects(count = 3) {
  const total = count * CARD.w + (count - 1) * CARD.gap;
  const x0 = 640 - total / 2;
  return Array.from({ length: count }, (_, i) => ({ x: x0 + i * (CARD.w + CARD.gap), y: CARD.y, w: CARD.w, h: CARD.h }));
}

export function rankFor(score) {
  if (score >= 85000) return { letter: 'S', color: PALETTE.shard, words: 'Lightbearer' };
  if (score >= 72000) return { letter: 'A', color: PALETTE.player, words: 'Warden Ascendant' };
  if (score >= 58000) return { letter: 'B', color: PALETTE.good, words: 'Steadfast' };
  return { letter: 'C', color: PALETTE.muted, words: 'Survivor' };
}

function dim(ctx, alpha) {
  ctx.fillStyle = `rgba(4, 2, 10, ${alpha})`;
  ctx.fillRect(0, 0, 1280, 720);
}

function panel(ctx, x, y, w, h, color) {
  ctx.fillStyle = 'rgba(12, 6, 28, 0.86)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 16);
  ctx.fill();
  neonStroke(ctx, color, 1.6, null);
}

function prompt(ctx, text, y, time, color = PALETTE.text) {
  ctx.globalAlpha = 0.55 + 0.45 * Math.sin(time * 4);
  glowText(ctx, text, 640, y, 20, color, { blur: 14, spacing: 4 });
  ctx.globalAlpha = 1;
}

/** The title mark: PRISMHEART with a turning prism for the "I". */
function logo(ctx, y, time, size = 104) {
  ctx.save();
  glowText(ctx, 'PRISMHEART', 640, y, size, PALETTE.heart, { blur: 40, spacing: 10, weight: 900 });
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.35;
  glowText(ctx, 'PRISMHEART', 640 - 3, y + 2, size, PALETTE.player, { blur: 10, spacing: 10, weight: 900 });
  ctx.globalAlpha = 1;
  ctx.restore();
  void time;
}

function keyCap(ctx, text, x, y) {
  ctx.font = `800 13px ${'"Segoe UI", Arial, sans-serif'}`;
  const w = Math.max(30, ctx.measureText(text).width + 16);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath();
  ctx.roundRect(x, y - 13, w, 26, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
  plainText(ctx, text, x + w / 2, y + 1, 13, PALETTE.text, { weight: 800 });
  return w;
}

export function drawTitle(ctx, ui) {
  dim(ctx, 0.5);
  logo(ctx, 200, ui.time);
  glowText(ctx, 'GUARD THE LAST LIGHT AGAINST THE HOLLOW', 640, 278, 18, PALETTE.player, { blur: 10, spacing: 6, weight: 700 });
  panel(ctx, 300, 330, 680, 220, withAlpha(PALETTE.arena, 0.8));
  plainText(ctx, 'Fly the Warden. Keep the Prismheart alive through ten waves of the night.', 640, 360, 15, PALETTE.text, { weight: 600 });
  plainText(ctx, 'Shards from fallen Hollow charge the Heart’s Pulse. Pick a new Attunement after every wave.', 640, 384, 13, PALETTE.muted, { weight: 600 });
  const rows = [
    [['W', 'A', 'S', 'D'], 'Move'],
    [['MOUSE'], 'Aim  ·  hold Left Click (or Arrow keys) to fire'],
    [['SHIFT', 'RMB'], 'Dash — untouchable for an instant, cuts through foes'],
    [['SPACE'], 'Release the Heart Pulse when charged'],
    [['ESC'], 'Pause      M  Mute'],
  ];
  let y = 418;
  for (const [keys, words] of rows) {
    let x = 350;
    for (const k of keys) x += keyCap(ctx, k, x, y) + 6;
    plainText(ctx, words, 560, y + 1, 14, PALETTE.text, { align: 'left', weight: 600 });
    y += 26;
  }
  prompt(ctx, 'CLICK OR PRESS ENTER TO BEGIN', 600, ui.time, PALETTE.heart);
  if (ui.best > 0) plainText(ctx, `BEST SCORE  ${ui.best.toLocaleString('en-US')}`, 640, 640, 13, PALETTE.muted, { weight: 700, spacing: 3 });
  plainText(ctx, ui.muted ? 'SOUND OFF (M)' : 'SOUND ON (M)', 1250, 700, 11, PALETTE.muted, { align: 'right', weight: 700, spacing: 2 });
}

export function drawUpgrade(ctx, state, ui) {
  dim(ctx, 0.62);
  const t = state.phaseTime;
  glowText(ctx, `WAVE ${state.waveIndex + 1} CLEARED`, 640, 92, 22, PALETTE.good, { blur: 14, spacing: 8 });
  glowText(ctx, 'CHOOSE AN ATTUNEMENT', 640, 140, 40, PALETTE.text, { blur: 20, spacing: 6 });
  const rects = cardRects(state.choices.length);
  state.choices.forEach((id, i) => {
    const u = UPGRADE_BY_ID[id];
    const r = rects[i];
    const pop = easeOutBack(clamp((t - i * 0.08) / 0.35, 0, 1));
    const hover = ui.hover === i;
    const lift = hover ? -10 : 0;
    ctx.save();
    ctx.translate(r.x + r.w / 2, r.y + r.h / 2 + lift);
    ctx.scale(pop, pop);
    ctx.translate(-r.w / 2, -r.h / 2);
    ctx.fillStyle = hover ? 'rgba(30, 16, 60, 0.96)' : 'rgba(14, 7, 32, 0.92)';
    ctx.beginPath();
    ctx.roundRect(0, 0, r.w, r.h, 18);
    ctx.fill();
    neonStroke(ctx, u.color, hover ? 2.6 : 1.6, hover ? '#ffffff' : null);
    // Emblem.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(r.w / 2, 92, 4, r.w / 2, 92, 80);
    g.addColorStop(0, withAlpha(u.color, 0.55));
    g.addColorStop(1, withAlpha(u.color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(r.w / 2 - 80, 12, 160, 160);
    ctx.restore();
    polygonPath(ctx, r.w / 2, 92, 46, 6, ui.time * 0.5 + i);
    neonStroke(ctx, u.color, 2, null);
    drawEmblem(ctx, u.id, r.w / 2, 92, u.color);
    const level = state.levels[id] ?? 0;
    glowText(ctx, u.name.toUpperCase(), r.w / 2, 176, 22, PALETTE.text, { blur: 8, spacing: 2 });
    wrapText(ctx, u.text(level), r.w / 2, 214, r.w - 44, 15, PALETTE.muted);
    for (let k = 0; k < u.max && k < 9; k += 1) {
      const px = r.w / 2 + (k - (Math.min(u.max, 9) - 1) / 2) * 18;
      polygonPath(ctx, px, 272, 5, 4, Math.PI / 4);
      ctx.fillStyle = k < level ? u.color : k === level ? '#ffffff' : 'rgba(255,255,255,0.15)';
      ctx.fill();
    }
    plainText(ctx, level === 0 ? 'NEW' : `LEVEL ${level + 1}`, r.w / 2, 292, 11, k0Color(level, u.color), { weight: 800, spacing: 2 });
    keyCap(ctx, String(i + 1), r.w / 2 - 15, r.h - 4);
    ctx.restore();
  });
  const next = WAVES[state.waveIndex + 1];
  if (next) plainText(ctx, `NEXT  ·  WAVE ${state.waveIndex + 2}: ${next.name.toUpperCase()}${next.boss ? '  ·  GUARDIAN' : ''}`, 640, 600, 14, next.boss ? PALETTE.boss : PALETTE.muted, { weight: 800, spacing: 3 });
  plainText(ctx, 'Click a card, or press 1 · 2 · 3', 640, 630, 13, PALETTE.muted, { weight: 600 });
}

function k0Color(level, color) {
  return level === 0 ? PALETTE.good : color;
}

/** Simple line icons, one per Attunement, drawn inside the card's hexagon. */
function drawEmblem(ctx, id, x, y, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  switch (id) {
    case 'twin':
      for (const o of [-10, 0, 10]) {
        ctx.moveTo(-16, o * 1.2);
        ctx.lineTo(18, o * 0.4);
      }
      break;
    case 'rate':
      for (const o of [-12, 0, 12]) {
        ctx.moveTo(o - 8, -12);
        ctx.lineTo(o + 4, 0);
        ctx.lineTo(o - 8, 12);
      }
      break;
    case 'power':
      polygonPath(ctx, 0, 0, 18, 4, 0);
      ctx.moveTo(7, 0);
      ctx.arc(0, 0, 7, 0, TAU);
      break;
    case 'pierce':
      ctx.moveTo(-22, 0);
      ctx.lineTo(22, 0);
      ctx.moveTo(12, -8);
      ctx.lineTo(22, 0);
      ctx.lineTo(12, 8);
      ctx.moveTo(-4, -12);
      ctx.lineTo(-4, 12);
      break;
    case 'orbit':
      ctx.arc(0, 0, 18, 0, TAU);
      for (let i = 0; i < 3; i += 1) {
        const a = (i / 3) * TAU;
        ctx.moveTo(Math.cos(a) * 18 + 5, Math.sin(a) * 18);
        ctx.arc(Math.cos(a) * 18, Math.sin(a) * 18, 5, 0, TAU);
      }
      break;
    case 'dash':
      ctx.moveTo(-20, -10);
      ctx.lineTo(4, -10);
      ctx.moveTo(-24, 0);
      ctx.lineTo(8, 0);
      ctx.moveTo(-20, 10);
      ctx.lineTo(4, 10);
      ctx.moveTo(8, -14);
      ctx.lineTo(20, 0);
      ctx.lineTo(8, 14);
      break;
    case 'magnet':
      ctx.arc(0, 0, 6, 0, TAU);
      ctx.moveTo(14, 0);
      ctx.arc(0, 0, 14, 0, TAU);
      ctx.moveTo(22, 0);
      ctx.arc(0, 0, 22, 0, TAU);
      break;
    case 'pulse':
      ctx.moveTo(-24, 0);
      ctx.lineTo(-10, 0);
      ctx.lineTo(-5, -14);
      ctx.lineTo(3, 14);
      ctx.lineTo(8, 0);
      ctx.lineTo(24, 0);
      break;
    case 'turret':
      ctx.moveTo(0, -18);
      ctx.lineTo(10, 0);
      ctx.lineTo(0, 18);
      ctx.lineTo(-10, 0);
      ctx.closePath();
      ctx.moveTo(12, -12);
      ctx.lineTo(24, -22);
      ctx.moveTo(-12, -12);
      ctx.lineTo(-24, -22);
      break;
    case 'mend':
      ctx.moveTo(0, -18);
      ctx.lineTo(12, 0);
      ctx.lineTo(0, 18);
      ctx.lineTo(-12, 0);
      ctx.closePath();
      ctx.moveTo(0, -6);
      ctx.lineTo(0, 6);
      ctx.moveTo(-6, 0);
      ctx.lineTo(6, 0);
      break;
    case 'hull':
      polygonPath(ctx, 0, 0, 18, 6, Math.PI / 6);
      ctx.moveTo(0, -8);
      ctx.lineTo(0, 8);
      ctx.moveTo(-8, 0);
      ctx.lineTo(8, 0);
      break;
    default:
      ctx.moveTo(-18, 10);
      ctx.quadraticCurveTo(0, -20, 20, -6);
      ctx.moveTo(-18, 18);
      ctx.quadraticCurveTo(4, -4, 20, 6);
      break;
  }
  neonStroke(ctx, color, 2.4);
  ctx.restore();
}

function wrapText(ctx, text, x, y, width, size, color) {
  ctx.font = `600 ${size}px "Segoe UI", Arial, sans-serif`;
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > width && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  lines.push(line);
  lines.forEach((l, i) => plainText(ctx, l, x, y + i * (size + 6), size, color, { weight: 600 }));
}

export function drawPaused(ctx, ui) {
  dim(ctx, 0.6);
  glowText(ctx, 'PAUSED', 640, 300, 64, PALETTE.text, { blur: 24, spacing: 14 });
  plainText(ctx, 'ESC or click  resume      R  restart run      M  ' + (ui.muted ? 'sound on' : 'sound off'), 640, 380, 16, PALETTE.muted, { weight: 700, spacing: 1 });
}

function statRows(ctx, rows, x, y, w) {
  rows.forEach(([name, value, color], i) => {
    const ry = y + i * 34;
    plainText(ctx, name, x, ry, 15, PALETTE.muted, { align: 'left', weight: 700, spacing: 2 });
    plainText(ctx, value, x + w, ry, 18, color ?? PALETTE.text, { align: 'right', weight: 800 });
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(x, ry + 16, w, 1);
  });
}

export function drawGameOver(ctx, state, ui) {
  dim(ctx, clamp(state.phaseTime * 1.5, 0, 0.7));
  const heart = state.lostReason === 'heart';
  glowText(ctx, heart ? 'THE HEART IS SHATTERED' : 'THE WARDEN HAS FALLEN', 640, 150, 54, PALETTE.danger, { blur: 30, spacing: 6 });
  plainText(ctx, heart ? 'The Hollow drank the last light.' : 'Without its keeper, the light went out.', 640, 205, 17, PALETTE.muted, { weight: 600 });
  panel(ctx, 400, 245, 480, 280, withAlpha(PALETTE.danger, 0.7));
  statRows(ctx, [
    ['SCORE', state.score.toLocaleString('en-US'), PALETTE.shard],
    ['WAVE REACHED', `${state.waveIndex + 1} / ${WAVES.length}  ·  ${WAVES[state.waveIndex].name}`],
    ['HOLLOW DESTROYED', String(state.kills)],
    ['LONGEST CHAIN', String(state.bestCombo)],
    ['PULSES RELEASED', String(state.pulses)],
    ['BEST SCORE', Math.max(ui.best, state.score).toLocaleString('en-US'), ui.newBest ? PALETTE.good : PALETTE.text],
  ], 440, 285, 400);
  if (ui.newBest) glowText(ctx, 'NEW BEST!', 640, 552, 20, PALETTE.good, { blur: 14, spacing: 6 });
  prompt(ctx, 'PRESS ENTER OR CLICK TO RISE AGAIN', 610, ui.time, PALETTE.text);
  plainText(ctx, 'R  restart   ·   ESC  title', 640, 648, 13, PALETTE.muted, { weight: 700, spacing: 2 });
}

export function drawVictory(ctx, state, ui) {
  dim(ctx, clamp(state.phaseTime * 1.2, 0, 0.62));
  const rank = rankFor(state.score);
  glowText(ctx, 'DAWN BREAKS', 640, 118, 76, PALETTE.heart, { blur: 40, spacing: 14, weight: 900 });
  plainText(ctx, 'The Null Choir is silenced. The Prismheart endures.', 640, 178, 18, PALETTE.text, { weight: 600 });
  panel(ctx, 300, 215, 680, 330, withAlpha(PALETTE.heart, 0.8));
  statRows(ctx, [
    ['WAVES SURVIVED', `${WAVES.length} / ${WAVES.length}`, PALETTE.good],
    ['HOLLOW DESTROYED', String(state.kills)],
    ['LONGEST CHAIN', String(state.bestCombo)],
    ['SHARDS GATHERED', String(state.shardsTaken)],
    ['PULSES RELEASED', String(state.pulses)],
    ['HULL BONUS', `+${state.bonus.hull.toLocaleString('en-US')}`, PALETTE.player],
    ['HEART BONUS', `+${state.bonus.heart.toLocaleString('en-US')}`, PALETTE.heart],
    ['FINAL SCORE', state.score.toLocaleString('en-US'), PALETTE.shard],
  ], 340, 255, 400);
  // The rank seal.
  const sx = 860;
  const sy = 370;
  const pop = easeOutBack(clamp((state.phaseTime - 0.6) / 0.5, 0, 1));
  ctx.save();
  ctx.translate(sx, sy);
  ctx.scale(pop, pop);
  polygonPath(ctx, 0, 0, 70, 8, ui.time * 0.3);
  ctx.fillStyle = withAlpha(rank.color, 0.12);
  ctx.fill();
  neonStroke(ctx, rank.color, 2.4);
  glowText(ctx, rank.letter, 0, 4, 84, rank.color, { blur: 30, weight: 900 });
  plainText(ctx, rank.words.toUpperCase(), 0, 100, 12, rank.color, { weight: 800, spacing: 3 });
  ctx.restore();
  if (ui.newBest) glowText(ctx, 'NEW BEST!', 640, 572, 20, PALETTE.good, { blur: 14, spacing: 6 });
  prompt(ctx, 'PRESS ENTER OR CLICK TO PLAY AGAIN', 620, ui.time, PALETTE.heart);
  plainText(ctx, 'R  restart   ·   ESC  title', 640, 658, 13, PALETTE.muted, { weight: 700, spacing: 2 });
}
