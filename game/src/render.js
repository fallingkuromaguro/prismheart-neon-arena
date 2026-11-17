// Paints the world: the rippling lattice floor, the arena wall, the Heart, the Hollow, shots,
// the Warden and every spark. Logical 1280x720 coordinates, scaled and letterboxed to the window.
import { ARENA, FIELD, PALETTE, PLAYER } from './config.js';
import { clamp, TAU } from './math.js';
import { glow, neonStroke, plainText, polygonPath, withAlpha } from './paint.js';
import { WARNING_TIME } from './waves.js';
import { ENEMY_TYPES } from './enemies.js';

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0, dpr: 1 };
  let backdrop = null;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    view.dpr = dpr;
    view.scale = Math.min(w / FIELD.width, h / FIELD.height);
    view.x = (w - FIELD.width * view.scale) / 2;
    view.y = (h - FIELD.height * view.scale) / 2;
  }
  resize();
  window.addEventListener('resize', resize);

  /** Window (client) pixels to logical field coordinates. */
  function toLogical(clientX, clientY) {
    return { x: (clientX - view.x) / view.scale, y: (clientY - view.y) / view.scale };
  }

  function begin() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const k = view.dpr * view.scale;
    ctx.setTransform(k, 0, 0, k, view.x * view.dpr, view.y * view.dpr);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, FIELD.width, FIELD.height);
    ctx.clip();
    if (!backdrop) backdrop = makeBackdrop();
    ctx.drawImage(backdrop, 0, 0);
  }

  function end() {
    ctx.restore();
  }

  function drawWorld(state, options = {}) {
    const fx = state.fx;
    const shakeAmount = fx.trauma * fx.trauma * 18;
    const sx = Math.sin(state.time * 91) * shakeAmount;
    const sy = Math.cos(state.time * 77) * shakeAmount;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.globalCompositeOperation = 'lighter';
    drawGrid(ctx, state.grid, state);
    drawArena(ctx, state);
    drawWarnings(ctx, state);
    drawShards(ctx, state);
    drawHeart(ctx, state);
    ctx.globalCompositeOperation = 'source-over';
    for (const e of state.enemies) drawEnemy(ctx, e, state);
    ctx.globalCompositeOperation = 'lighter';
    drawBullets(ctx, state);
    drawEnemyShots(ctx, state);
    if (!options.hidePlayer) drawPlayer(ctx, state);
    drawParticles(ctx, state);
    drawRings(ctx, state);
    ctx.globalCompositeOperation = 'source-over';
    drawTexts(ctx, state);
    ctx.restore();
    drawDangerVignette(ctx, state);
    if (fx.flash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = withAlpha(fx.flashColor, fx.flash * 0.35);
      ctx.fillRect(0, 0, FIELD.width, FIELD.height);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  return { ctx, view, resize, toLogical, begin, end, drawWorld };
}

/** The static backdrop: deep violet glow behind the Heart, darker corners. Drawn once. */
function makeBackdrop() {
  const c = document.createElement('canvas');
  c.width = FIELD.width;
  c.height = FIELD.height;
  const g = c.getContext('2d');
  g.fillStyle = PALETTE.bg;
  g.fillRect(0, 0, FIELD.width, FIELD.height);
  const grad = g.createRadialGradient(640, 384, 20, 640, 384, 760);
  grad.addColorStop(0, 'rgba(60, 24, 120, 0.55)');
  grad.addColorStop(0.45, 'rgba(26, 11, 61, 0.45)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, FIELD.width, FIELD.height);
  // A faint field of fixed stars beyond the arena wall.
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 160; i += 1) {
    g.fillStyle = `rgba(200, 180, 255, ${0.15 + rnd() * 0.4})`;
    g.fillRect(rnd() * FIELD.width, rnd() * FIELD.height, 1.5, 1.5);
  }
  return c;
}

function drawGrid(ctx, grid, state) {
  const { cols, rows, homeX, homeY, dx, dy } = grid;
  const passes = [
    { every: 1, color: PALETTE.grid, width: 1 },
    { every: 4, color: PALETTE.gridBright, width: 1.4 },
  ];
  for (const pass of passes) {
    ctx.beginPath();
    for (let r = 0; r < rows; r += pass.every) {
      for (let c = 0; c < cols; c += 1) {
        const i = r * cols + c;
        if (c === 0) ctx.moveTo(homeX[i] + dx[i], homeY[i] + dy[i]);
        else ctx.lineTo(homeX[i] + dx[i], homeY[i] + dy[i]);
      }
    }
    for (let c = 0; c < cols; c += pass.every) {
      for (let r = 0; r < rows; r += 1) {
        const i = r * cols + c;
        if (r === 0) ctx.moveTo(homeX[i] + dx[i], homeY[i] + dy[i]);
        else ctx.lineTo(homeX[i] + dx[i], homeY[i] + dy[i]);
      }
    }
    ctx.strokeStyle = pass.color;
    ctx.lineWidth = pass.width;
    ctx.stroke();
  }
  // Where the floor is most disturbed it glows: brighter dots at displaced lattice points.
  for (let i = 0; i < dx.length; i += 1) {
    const m = Math.abs(dx[i]) + Math.abs(dy[i]);
    if (m > 3) {
      ctx.fillStyle = `rgba(170, 130, 255, ${clamp(m / 30, 0, 0.8)})`;
      ctx.fillRect(homeX[i] + dx[i] - 1.5, homeY[i] + dy[i] - 1.5, 3, 3);
    }
  }
  void state;
}

function drawArena(ctx, state) {
  const hurt = 1 - state.heart.hp / state.heart.maxHp;
  const color = hurt > 0.65 && Math.sin(state.time * 8) > 0 ? PALETTE.danger : PALETTE.arena;
  ctx.beginPath();
  ctx.roundRect(ARENA.left, ARENA.top, ARENA.right - ARENA.left, ARENA.bottom - ARENA.top, 18);
  neonStroke(ctx, color, 2.2, null);
  // Corner brackets.
  const L = 34;
  ctx.beginPath();
  for (const [x, y, sx, sy] of [[ARENA.left, ARENA.top, 1, 1], [ARENA.right, ARENA.top, -1, 1], [ARENA.left, ARENA.bottom, 1, -1], [ARENA.right, ARENA.bottom, -1, -1]]) {
    ctx.moveTo(x + sx * 6, y + sy * (L + 6));
    ctx.lineTo(x + sx * 6, y + sy * 6);
    ctx.lineTo(x + sx * (L + 6), y + sy * 6);
  }
  neonStroke(ctx, PALETTE.player, 2, '#ffffff');
}

function drawWarnings(ctx, state) {
  for (const w of state.warnings) {
    const t = w.t / WARNING_TIME;
    const color = ENEMY_TYPES[w.type].color;
    const r = 26 - t * 12;
    ctx.beginPath();
    ctx.arc(w.x, w.y, r, 0, TAU);
    ctx.strokeStyle = withAlpha(color, 0.25 + 0.5 * Math.abs(Math.sin(w.t * 18)));
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(w.x, w.y, 30, -Math.PI / 2, -Math.PI / 2 + t * TAU);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.stroke();
    glow(ctx, w.x, w.y, 40, color, 0.35 * t);
  }
}

function drawShards(ctx, state) {
  for (const s of state.shards) {
    const blink = s.age > 11 ? (Math.sin(s.age * 20) > 0 ? 1 : 0.3) : 1;
    glow(ctx, s.x, s.y, 16, PALETTE.shard, 0.6 * blink);
    polygonPath(ctx, s.x, s.y, 6, 4, s.spin);
    ctx.fillStyle = withAlpha(PALETTE.heartCore, blink);
    ctx.fill();
  }
}

function drawHeart(ctx, state) {
  const h = state.heart;
  const health = h.hp / h.maxHp;
  const beat = Math.exp(-h.beat * 7);
  const hurt = h.flash > 0;
  const color = hurt ? PALETTE.heartHurt : PALETTE.heart;
  glow(ctx, h.x, h.y, 150 + beat * 30, color, 0.35 + 0.25 * health);
  glow(ctx, h.x, h.y, 60, PALETTE.heartCore, 0.6 + beat * 0.4);
  // The pulse shockwave itself.
  if (h.wave) {
    ctx.beginPath();
    ctx.arc(h.x, h.y, h.wave.r, 0, TAU);
    ctx.strokeStyle = withAlpha(PALETTE.heart, 0.9 * (1 - h.wave.r / 460));
    ctx.lineWidth = 18;
    ctx.stroke();
  }
  // Integrity ring and pulse charge ring.
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(h.x, h.y, 54, -Math.PI / 2, -Math.PI / 2 + TAU * health);
  ctx.strokeStyle = health < 0.35 ? PALETTE.danger : withAlpha(PALETTE.heart, 0.85);
  ctx.lineWidth = 4;
  ctx.stroke();
  const ready = h.charge >= 1;
  ctx.beginPath();
  ctx.arc(h.x, h.y, 64, -Math.PI / 2, -Math.PI / 2 + TAU * h.charge);
  ctx.strokeStyle = ready ? withAlpha('#ffffff', 0.6 + 0.4 * Math.sin(state.time * 10)) : withAlpha(PALETTE.shard, 0.5);
  ctx.lineWidth = ready ? 4 : 2;
  ctx.stroke();
  // The crystal: a tall faceted prism, slowly turning (its facets shift with the turn).
  const turn = state.time * 0.8;
  const w = 26 * (1 + beat * 0.08);
  const tall = 44 * (1 + beat * 0.08);
  const mid = Math.cos(turn) * w;
  ctx.beginPath();
  ctx.moveTo(h.x, h.y - tall);
  ctx.lineTo(h.x + w, h.y);
  ctx.lineTo(h.x, h.y + tall);
  ctx.lineTo(h.x - w, h.y);
  ctx.closePath();
  ctx.fillStyle = withAlpha(color, 0.35);
  ctx.fill();
  neonStroke(ctx, color, 2.4);
  ctx.beginPath();
  ctx.moveTo(h.x, h.y - tall);
  ctx.lineTo(h.x + mid, h.y);
  ctx.lineTo(h.x, h.y + tall);
  ctx.moveTo(h.x - w, h.y);
  ctx.lineTo(h.x + mid, h.y);
  ctx.lineTo(h.x + w, h.y);
  ctx.strokeStyle = withAlpha(PALETTE.heartCore, 0.8);
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Cracks show as the Heart weakens.
  if (health < 0.66) {
    ctx.beginPath();
    ctx.moveTo(h.x - 4, h.y - 30);
    ctx.lineTo(h.x + 6, h.y - 12);
    ctx.lineTo(h.x - 3, h.y + 4);
    if (health < 0.33) {
      ctx.moveTo(h.x + 12, h.y + 2);
      ctx.lineTo(h.x + 2, h.y + 18);
      ctx.lineTo(h.x + 7, h.y + 32);
    }
    ctx.strokeStyle = PALETTE.danger;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function drawEnemy(ctx, e, state) {
  const color = e.flash > 0 ? '#ffffff' : e.color;
  const fill = withAlpha(e.color, e.flash > 0 ? 0.6 : 0.16);
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, e.x, e.y, e.r * 3, e.color, e.type === 'boss' ? 0.45 : 0.32);
  ctx.globalCompositeOperation = 'source-over';
  const spawnScale = Math.min(1, e.t / 0.25);
  const r = e.r * spawnScale;
  switch (e.type) {
    case 'mote':
      polygonPath(ctx, e.x, e.y, r, 4, e.t * e.spin * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      neonStroke(ctx, color, 2);
      break;
    case 'dart': {
      if (e.mode === 'aim') {
        const t = 1 - e.timer / 0.6;
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(e.x + Math.cos(e.angle) * 380, e.y + Math.sin(e.angle) * 380);
        ctx.strokeStyle = withAlpha(PALETTE.danger, 0.15 + 0.5 * t);
        ctx.lineWidth = 2 + t * 4;
        ctx.setLineDash([10, 8]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      const a = e.angle;
      ctx.beginPath();
      ctx.moveTo(e.x + Math.cos(a) * r * 1.5, e.y + Math.sin(a) * r * 1.5);
      ctx.lineTo(e.x + Math.cos(a + 2.5) * r, e.y + Math.sin(a + 2.5) * r);
      ctx.lineTo(e.x - Math.cos(a) * r * 0.3, e.y - Math.sin(a) * r * 0.3);
      ctx.lineTo(e.x + Math.cos(a - 2.5) * r, e.y + Math.sin(a - 2.5) * r);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      neonStroke(ctx, color, 2);
      break;
    }
    case 'splitter':
      polygonPath(ctx, e.x, e.y, r, 6, e.angle);
      ctx.fillStyle = fill;
      ctx.fill();
      neonStroke(ctx, color, 2.6);
      polygonPath(ctx, e.x, e.y, r * 0.5, 6, -e.angle * 2);
      neonStroke(ctx, color, 1.6, null);
      break;
    case 'weaver': {
      const tell = e.cooldown < 0.45 ? 1 - e.cooldown / 0.45 : 0;
      if (tell > 0) glow(ctx, e.x, e.y, r * (2 + tell * 2), '#ffffff', 0.4 * tell);
      ctx.beginPath();
      ctx.arc(e.x, e.y, r, 0, TAU);
      ctx.fillStyle = fill;
      ctx.fill();
      neonStroke(ctx, color, 2);
      ctx.beginPath();
      for (let i = 0; i < 3; i += 1) {
        const a = e.angle + (i / 3) * TAU;
        ctx.moveTo(e.x + Math.cos(a) * r * 1.6 + 3.5, e.y + Math.sin(a) * r * 1.6);
        ctx.arc(e.x + Math.cos(a) * r * 1.6, e.y + Math.sin(a) * r * 1.6, 3.5, 0, TAU);
      }
      ctx.fillStyle = color;
      ctx.fill();
      break;
    }
    case 'leech': {
      if (e.latched) {
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(state.heart.x, state.heart.y);
        ctx.strokeStyle = withAlpha(PALETTE.leech, 0.3 + 0.3 * Math.sin(e.t * 14));
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      ctx.beginPath();
      for (let i = 0; i < 5; i += 1) {
        const a = e.angle + Math.PI + (i - 2) * 0.45;
        const wav = Math.sin(e.t * 10 + i) * 4;
        ctx.moveTo(e.x + Math.cos(a) * r * 0.8, e.y + Math.sin(a) * r * 0.8);
        ctx.lineTo(e.x + Math.cos(a) * r * 1.8 + wav, e.y + Math.sin(a) * r * 1.8 - wav);
      }
      ctx.strokeStyle = withAlpha(color, 0.8);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(e.x, e.y, r, 0, TAU);
      ctx.fillStyle = fill;
      ctx.fill();
      neonStroke(ctx, color, 2);
      ctx.beginPath();
      ctx.arc(e.x + Math.cos(e.angle) * r * 0.35, e.y + Math.sin(e.angle) * r * 0.35, r * 0.35, 0, TAU);
      ctx.fillStyle = color;
      ctx.fill();
      break;
    }
    case 'boss':
      drawBoss(ctx, e, color, fill);
      break;
    default:
      break;
  }
  // A thin health tick under anything tougher than a mote, once it has been hurt.
  if (e.type !== 'boss' && e.hp < e.maxHp && e.maxHp > 2) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(e.x - e.r, e.y + e.r + 7, e.r * 2, 3);
    ctx.fillStyle = e.color;
    ctx.fillRect(e.x - e.r, e.y + e.r + 7, e.r * 2 * Math.max(0, e.hp / e.maxHp), 3);
  }
}

function drawBoss(ctx, e, color, fill) {
  const r = e.r * Math.min(1, e.t / 0.8);
  if (e.kind === 'choir') {
    for (let i = 0; i < 3; i += 1) {
      polygonPath(ctx, e.x, e.y, r * (1 - i * 0.24), 3, e.angle * (i % 2 ? -1.4 : 1) + i);
      if (i === 0) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      neonStroke(ctx, i === 1 ? '#ff8fb8' : color, 2.6 - i * 0.5);
    }
    ctx.beginPath();
    ctx.arc(e.x, e.y, r * 1.25, 0, TAU);
    ctx.setLineDash([4, 10]);
    neonStroke(ctx, color, 1.4, null);
    ctx.setLineDash([]);
    // The eye.
    glow(ctx, e.x, e.y, 30, '#ffffff', 0.8);
    ctx.beginPath();
    ctx.ellipse(e.x, e.y, 13, 5 + e.phase * 2, 0, 0, TAU);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  } else {
    polygonPath(ctx, e.x, e.y, r, 7, e.angle, r * 0.55);
    ctx.fillStyle = fill;
    ctx.fill();
    neonStroke(ctx, color, 3);
    polygonPath(ctx, e.x, e.y, r * 0.42, 7, -e.angle * 1.7);
    neonStroke(ctx, '#ff8fb8', 2);
    glow(ctx, e.x, e.y, 26, '#ffffff', 0.7);
  }
  if (e.shielded) {
    ctx.beginPath();
    ctx.arc(e.x, e.y, r * 1.5, 0, TAU);
    neonStroke(ctx, '#ffffff', 3);
  }
}

function drawBullets(ctx, state) {
  ctx.lineCap = 'round';
  for (const b of state.bullets) {
    glow(ctx, b.x, b.y, 14, b.color, 0.5);
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.022, b.y - b.vy * 0.022);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = b.color;
    ctx.lineWidth = b.r * 1.3;
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = b.r * 0.5;
    ctx.stroke();
  }
}

function drawEnemyShots(ctx, state) {
  for (const s of state.enemyShots) {
    glow(ctx, s.x, s.y, s.r * 3.2, s.color, 0.75);
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r * 0.6, 0, TAU);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }
}

function shipPath(ctx, x, y, a, s) {
  const c = Math.cos(a);
  const n = Math.sin(a);
  const pt = (px, py) => [x + px * c * s - py * n * s, y + px * n * s + py * c * s];
  const pts = [pt(19, 0), pt(-11, -12), pt(-5, 0), pt(-11, 12)];
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

function drawPlayer(ctx, state) {
  const p = state.player;
  if (state.phase === 'dying' && state.lostReason === 'warden') return;
  if (state.phase === 'lost' && state.lostReason === 'warden') return;
  for (const t of p.trail) {
    shipPath(ctx, t.x, t.y, t.a, 1);
    ctx.strokeStyle = withAlpha(PALETTE.player, t.life * 2);
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  const n = state.stats.orbitals;
  for (let i = 0; i < n; i += 1) {
    const a = state.time * PLAYER.orbitSpeed + (i / n) * TAU;
    const x = p.x + Math.cos(a) * PLAYER.orbitRadius;
    const y = p.y + Math.sin(a) * PLAYER.orbitRadius;
    glow(ctx, x, y, 18, '#c9a2ff', 0.7);
    polygonPath(ctx, x, y, 8, 3, a * 2);
    neonStroke(ctx, '#c9a2ff', 1.6);
  }
  const blink = p.invulnerable > 0 && Math.sin(state.time * 40) > 0;
  if (blink) return;
  glow(ctx, p.x, p.y, 46, PALETTE.player, 0.55);
  const back = p.recoil * 2.5;
  shipPath(ctx, p.x - Math.cos(p.aim) * back, p.y - Math.sin(p.aim) * back, p.aim, 1);
  ctx.fillStyle = withAlpha(PALETTE.player, 0.3);
  ctx.fill();
  neonStroke(ctx, PALETTE.player, 2.2);
  glow(ctx, p.x - Math.cos(p.aim) * 7, p.y - Math.sin(p.aim) * 7, 11 + Math.sin(state.time * 50) * 2, '#ffffff', 0.9);
}

function drawParticles(ctx, state) {
  for (const p of state.fx.particles) {
    const a = clamp(p.life / p.max, 0, 1);
    if (p.streak) {
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04);
      ctx.strokeStyle = withAlpha(p.color, a);
      ctx.lineWidth = p.size;
      ctx.stroke();
    } else {
      const s = p.size * (0.5 + a * 0.7);
      if (p.size > 3.4) glow(ctx, p.x, p.y, s * 3, p.color, a * 0.5);
      ctx.fillStyle = withAlpha(p.color, a);
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
  }
}

function drawRings(ctx, state) {
  for (const r of state.fx.rings) {
    const a = clamp(r.life / r.max, 0, 1);
    ctx.beginPath();
    ctx.arc(r.x, r.y, Math.max(0, r.r), 0, TAU);
    ctx.strokeStyle = withAlpha(r.color, a * 0.85);
    ctx.lineWidth = r.width * (0.4 + a);
    ctx.stroke();
  }
}

function drawTexts(ctx, state) {
  for (const t of state.fx.texts) {
    ctx.globalAlpha = clamp(t.life / t.max * 1.6, 0, 1);
    ctx.shadowColor = t.color;
    ctx.shadowBlur = 8;
    plainText(ctx, t.text, t.x, t.y, t.size, t.color, { weight: 800 });
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;
}

function drawDangerVignette(ctx, state) {
  const p = state.player;
  const h = state.heart;
  const low = Math.max(p.hull === 1 ? 0.6 : 0, h.hp < h.maxHp * 0.3 ? 0.6 : 0);
  if (low <= 0 || state.phase !== 'fight') return;
  const a = low * (0.5 + 0.5 * Math.sin(state.time * 6));
  const grad = ctx.createRadialGradient(640, 360, 300, 640, 360, 760);
  grad.addColorStop(0, 'rgba(255, 40, 80, 0)');
  grad.addColorStop(1, `rgba(255, 40, 80, ${0.35 * a})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
}
