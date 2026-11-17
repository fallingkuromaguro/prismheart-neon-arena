// The arena floor: a lattice of springs that ripples when things explode, the Heart beats or the
// Pulse fires. Points are pushed by impulses, pulled home by a spring and smoothed toward their
// neighbours, which is what carries a ripple outward across the floor.
import { ARENA } from './config.js';

const SPACING = 32;
const SPRING = 38;
const DAMPING = 5.5;
const COUPLING = 22;

export function createGrid() {
  const cols = Math.round((ARENA.right - ARENA.left) / SPACING) + 1;
  const rows = Math.round((ARENA.bottom - ARENA.top) / SPACING) + 1;
  const n = cols * rows;
  const grid = { cols, rows, homeX: new Float32Array(n), homeY: new Float32Array(n), dx: new Float32Array(n), dy: new Float32Array(n), vx: new Float32Array(n), vy: new Float32Array(n) };
  const stepX = (ARENA.right - ARENA.left) / (cols - 1);
  const stepY = (ARENA.bottom - ARENA.top) / (rows - 1);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const i = r * cols + c;
      grid.homeX[i] = ARENA.left + c * stepX;
      grid.homeY[i] = ARENA.top + r * stepY;
    }
  }
  return grid;
}

/** Push every point within `radius` of (x, y) away from it (a negative strength pulls inward). */
export function gridImpulse(grid, x, y, strength, radius) {
  const r2 = radius * radius;
  for (let i = 0; i < grid.homeX.length; i += 1) {
    const px = grid.homeX[i] + grid.dx[i];
    const py = grid.homeY[i] + grid.dy[i];
    const ddx = px - x;
    const ddy = py - y;
    const d2 = ddx * ddx + ddy * ddy;
    if (d2 > r2 || d2 < 1) continue;
    const d = Math.sqrt(d2);
    const f = strength * (1 - d / radius);
    grid.vx[i] += (ddx / d) * f;
    grid.vy[i] += (ddy / d) * f;
  }
}

export function updateGrid(grid, dt) {
  const { cols, rows, dx, dy, vx, vy } = grid;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const i = r * cols + c;
      if (r === 0 || c === 0 || r === rows - 1 || c === cols - 1) {
        dx[i] = 0;
        dy[i] = 0;
        continue;
      }
      const ax = (dx[i - 1] + dx[i + 1] + dx[i - cols] + dx[i + cols]) * 0.25 - dx[i];
      const ay = (dy[i - 1] + dy[i + 1] + dy[i - cols] + dy[i + cols]) * 0.25 - dy[i];
      vx[i] += (-SPRING * dx[i] + COUPLING * ax * 4 - DAMPING * vx[i]) * dt;
      vy[i] += (-SPRING * dy[i] + COUPLING * ay * 4 - DAMPING * vy[i]) * dt;
    }
  }
  for (let i = 0; i < dx.length; i += 1) {
    dx[i] += vx[i] * dt;
    dy[i] += vy[i] * dt;
    if (dx[i] > 40) dx[i] = 40; else if (dx[i] < -40) dx[i] = -40;
    if (dy[i] > 40) dy[i] = 40; else if (dy[i] < -40) dy[i] = -40;
  }
}
