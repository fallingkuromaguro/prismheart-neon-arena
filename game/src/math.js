// Little vector and easing helpers shared by the simulation and the renderer.

export const TAU = Math.PI * 2;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
export const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));

/** The shortest signed turn from angle a to angle b, in -PI..PI. */
export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** A unit vector from (ax, ay) toward (bx, by), and the distance; zero vector when they coincide. */
export function towards(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const d = Math.sqrt(dx * dx + dy * dy);
  return d > 1e-6 ? { x: dx / d, y: dy / d, d } : { x: 0, y: 0, d: 0 };
}

export const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const easeOutBack = (t) => {
  const c = 1.70158;
  const x = clamp(t, 0, 1) - 1;
  return 1 + (c + 1) * x * x * x + c * x * x;
};
