// Drawing primitives for the neon look: cached glow sprites, double-stroked neon outlines,
// glowing text, and polygons. Everything glowing is drawn with additive blending.
import { FONT } from './config.js';
import { TAU } from './math.js';

const glowCache = new Map();

/** A soft round glow of `color`, 128 px across, made once and reused. */
export function glowSprite(color) {
  let sprite = glowCache.get(color);
  if (sprite) return sprite;
  sprite = document.createElement('canvas');
  sprite.width = 128;
  sprite.height = 128;
  const g = sprite.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, color);
  grad.addColorStop(0.25, withAlpha(color, 0.45));
  grad.addColorStop(0.6, withAlpha(color, 0.12));
  grad.addColorStop(1, withAlpha(color, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  glowCache.set(color, sprite);
  return sprite;
}

/** '#rrggbb' (or 'rgba(...)', passed through) with the given alpha. */
export function withAlpha(color, alpha) {
  if (color[0] !== '#') return color;
  const n = Number.parseInt(color.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export function glow(ctx, x, y, radius, color, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.drawImage(glowSprite(color), x - radius, y - radius, radius * 2, radius * 2);
  ctx.globalAlpha = 1;
}

/** Trace a regular polygon (or star when `inner` is given) into the current path. */
export function polygonPath(ctx, x, y, radius, sides, rotation, inner = 0) {
  ctx.beginPath();
  const points = inner ? sides * 2 : sides;
  for (let i = 0; i < points; i += 1) {
    const r = inner && i % 2 ? inner : radius;
    const a = rotation + (i / points) * TAU;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/** Stroke the current path as a neon tube: a wide faint pass, then a thin bright core. */
export function neonStroke(ctx, color, width = 2, core = '#ffffff') {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = withAlpha(color, 0.28);
  ctx.lineWidth = width * 4;
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
  if (core) {
    ctx.strokeStyle = withAlpha(core, 0.7);
    ctx.lineWidth = Math.max(1, width * 0.4);
    ctx.stroke();
  }
}

export function font(size, weight = 700) {
  return `${weight} ${size}px ${FONT}`;
}

/** Text with a coloured halo behind it. */
export function glowText(ctx, text, x, y, size, color, { align = 'center', weight = 800, blur = 18, spacing = 0, baseline = 'middle' } = {}) {
  ctx.font = font(size, weight);
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.letterSpacing = `${spacing}px`;
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.shadowBlur = blur * 0.4;
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 0.55;
  ctx.fillText(text, x, y);
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.letterSpacing = '0px';
}

export function plainText(ctx, text, x, y, size, color, { align = 'center', weight = 600, baseline = 'middle', spacing = 0 } = {}) {
  ctx.font = font(size, weight);
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.letterSpacing = `${spacing}px`;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.letterSpacing = '0px';
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
