// The heads-up display: Warden hull, Heart integrity, wave and its progress, score and combo,
// dash and Pulse readiness, the boss bar, the wave banner and the aiming reticle.
import { ARENA, PALETTE } from './config.js';
import { comboMultiplier } from './combat.js';
import { BOSSES } from './boss.js';
import { clamp, easeOutCubic, TAU } from './math.js';
import { glowText, plainText, polygonPath, withAlpha, neonStroke } from './paint.js';
import { waveRemaining, WAVES } from './waves.js';
import { COMBO } from './config.js';

function bar(ctx, x, y, w, h, fraction, color, back = 'rgba(255,255,255,0.08)') {
  ctx.fillStyle = back;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fill();
  if (fraction <= 0) return;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.roundRect(x, y, Math.max(h, w * clamp(fraction, 0, 1)), h, h / 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

function label(ctx, text, x, y, align = 'left') {
  plainText(ctx, text, x, y, 11, PALETTE.muted, { align, weight: 700, spacing: 2 });
}

export function drawHud(ctx, state, ui = {}) {
  const p = state.player;
  const h = state.heart;
  ctx.fillStyle = 'rgba(5, 3, 12, 0.72)';
  ctx.fillRect(0, 0, 1280, ARENA.top - 6);

  // Warden hull: one hexagon per plate.
  label(ctx, 'WARDEN HULL', 30, 16);
  for (let i = 0; i < state.stats.maxHull; i += 1) {
    const x = 40 + i * 26;
    polygonPath(ctx, x, 40, 10, 6, Math.PI / 6);
    if (i < p.hull) {
      ctx.fillStyle = p.hull === 1 ? PALETTE.danger : PALETTE.player;
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  // Heart integrity.
  const hx = 270;
  label(ctx, 'HEART INTEGRITY', hx, 16);
  plainText(ctx, `${Math.ceil(h.hp)} / ${h.maxHp}`, hx + 250, 16, 12, h.hp < h.maxHp * 0.35 ? PALETTE.danger : PALETTE.heart, { align: 'right', weight: 800 });
  bar(ctx, hx, 32, 250, 12, h.hp / h.maxHp, h.hp < h.maxHp * 0.35 ? PALETTE.danger : PALETTE.heart);

  // Wave and how much of it is left.
  const wave = WAVES[state.waveIndex];
  glowText(ctx, `WAVE ${state.waveIndex + 1} / ${WAVES.length}`, 640, 18, 18, PALETTE.text, { blur: 10, spacing: 3 });
  plainText(ctx, wave.name.toUpperCase(), 640, 36, 11, PALETTE.muted, { weight: 700, spacing: 2 });
  bar(ctx, 520, 48, 240, 6, state.phase === 'fight' ? waveRemaining(state) : 0, wave.boss ? PALETTE.boss : PALETTE.arena);

  // Score, multiplier and the combo's fuse.
  glowText(ctx, state.score.toLocaleString('en-US'), 1250, 26, 30, PALETTE.text, { align: 'right', blur: 12 });
  const mult = comboMultiplier(state);
  label(ctx, `BEST ${Math.max(ui.best ?? 0, state.score).toLocaleString('en-US')}`, 1250, 52, 'right');
  if (mult > 1 || state.combo > 0) {
    const mx = 1000;
    glowText(ctx, `×${mult}`, mx, 24, 26, mult >= 6 ? PALETTE.danger : PALETTE.shard, { align: 'right', blur: 14 });
    plainText(ctx, `${state.combo} CHAIN`, mx, 46, 11, PALETTE.muted, { align: 'right', weight: 700, spacing: 1 });
    bar(ctx, mx - 70, 55, 70, 3, state.comboTimer / COMBO.window, PALETTE.shard);
  }

  drawAbilities(ctx, state);
  if (state.boss && !state.boss.dead && state.phase === 'fight') drawBossBar(ctx, state.boss);
  drawWaveBanner(ctx, state);
  if (ui.aim && (state.phase === 'fight' || state.phase === 'clear')) drawReticle(ctx, ui.aim.x, ui.aim.y, state);
}

function drawAbilities(ctx, state) {
  const p = state.player;
  const h = state.heart;
  const y = ARENA.bottom - 26;
  // Dash.
  const dashReady = p.dashCd <= 0;
  const dashFrac = 1 - p.dashCd / state.stats.dashCooldown;
  ctx.fillStyle = 'rgba(5,3,12,0.6)';
  ctx.beginPath();
  ctx.roundRect(ARENA.left + 14, y - 16, 236, 32, 16);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(ARENA.left + 32, y, 10, -Math.PI / 2, -Math.PI / 2 + TAU * dashFrac);
  ctx.strokeStyle = dashReady ? PALETTE.player : withAlpha(PALETTE.player, 0.4);
  ctx.lineWidth = 3;
  ctx.stroke();
  plainText(ctx, 'DASH', ARENA.left + 50, y, 12, dashReady ? PALETTE.text : PALETTE.muted, { align: 'left', weight: 800, spacing: 1 });
  plainText(ctx, 'SHIFT / RMB', ARENA.left + 90, y, 10, PALETTE.muted, { align: 'left', weight: 600 });
  // Pulse.
  const ready = h.charge >= 1;
  ctx.beginPath();
  ctx.arc(ARENA.left + 172, y, 10, -Math.PI / 2, -Math.PI / 2 + TAU * h.charge);
  ctx.strokeStyle = ready ? PALETTE.heart : withAlpha(PALETTE.shard, 0.5);
  ctx.lineWidth = 3;
  ctx.stroke();
  if (ready) {
    const blink = 0.6 + 0.4 * Math.sin(state.time * 8);
    glowText(ctx, 'PULSE', ARENA.left + 190, y, 12, withAlpha(PALETTE.heart, blink), { align: 'left', blur: 10 });
  } else {
    plainText(ctx, 'PULSE', ARENA.left + 190, y, 12, PALETTE.muted, { align: 'left', weight: 800, spacing: 1 });
  }
  plainText(ctx, 'SPACE', ARENA.left + 232, y, 10, PALETTE.muted, { align: 'right', weight: 600 });
}

function drawBossBar(ctx, boss) {
  const def = BOSSES[boss.kind];
  const w = 520;
  const x = 640 - w / 2;
  const y = ARENA.top + 22;
  glowText(ctx, def.name, 640, y - 4, 14, PALETTE.boss, { blur: 12, spacing: 4 });
  bar(ctx, x, y + 8, w, 8, boss.hp / boss.maxHp, boss.shielded ? '#ffffff' : PALETTE.boss);
  if (boss.kind === 'choir') {
    for (const f of [1 / 3, 2 / 3]) {
      ctx.fillStyle = PALETTE.bg;
      ctx.fillRect(x + w * f - 1, y + 7, 2, 10);
    }
  }
}

function drawWaveBanner(ctx, state) {
  if (state.phase !== 'fight' || state.waveTime > 3) return;
  const t = state.waveTime;
  const a = t < 0.3 ? t / 0.3 : t > 2.4 ? (3 - t) / 0.6 : 1;
  const wave = WAVES[state.waveIndex];
  const slide = (1 - easeOutCubic(t / 0.5)) * 40;
  ctx.globalAlpha = clamp(a, 0, 1);
  ctx.fillStyle = 'rgba(5,3,12,0.55)';
  ctx.fillRect(0, 230, 1280, 110);
  glowText(ctx, wave.boss ? `WAVE ${state.waveIndex + 1} — GUARDIAN` : `WAVE ${state.waveIndex + 1}`, 640 - slide, 262, 22, wave.boss ? PALETTE.boss : PALETTE.player, { blur: 14, spacing: 10 });
  glowText(ctx, wave.name.toUpperCase(), 640 + slide, 304, 44, PALETTE.text, { blur: 22, spacing: 6 });
  ctx.globalAlpha = 1;
}

function drawReticle(ctx, x, y, state) {
  const spin = state.time * 2;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.beginPath();
  ctx.arc(x, y, 11, 0, TAU);
  ctx.strokeStyle = withAlpha(PALETTE.player, 0.8);
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < 4; i += 1) {
    const a = spin + (i * Math.PI) / 2;
    ctx.moveTo(x + Math.cos(a) * 15, y + Math.sin(a) * 15);
    ctx.lineTo(x + Math.cos(a) * 21, y + Math.sin(a) * 21);
  }
  neonStroke(ctx, PALETTE.player, 1.6, null);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
  ctx.restore();
}
