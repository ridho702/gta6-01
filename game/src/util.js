// Solmar Bay — shared utilities: seeded random numbers, math helpers,
// canvas texture helpers. No game logic lives here, only small pure tools
// every other module imports.

// Deterministic PRNG (mulberry32). The city is generated from a fixed seed
// so the same world shows up every load, including in screenshots.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  constructor(seed) {
    this.next = mulberry32(seed);
  }
  // Float in [0, 1).
  float() {
    return this.next();
  }
  // Float in [a, b).
  range(a, b) {
    return a + (b - a) * this.next();
  }
  // Integer in [a, b] inclusive.
  int(a, b) {
    return a + Math.floor(this.next() * (b - a + 1));
  }
  // Random element of an array.
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }
  // True with probability p.
  chance(p) {
    return this.next() < p;
  }
}

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Shortest-path angle interpolation (angles in radians).
export function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

// Build a canvas and hand it to a draw callback. Callers turn the canvas
// into a texture; this helper stays free of any 3D library.
export function makeCanvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  return c;
}

// Format a game-clock minute count (minutes since midnight) as HH:MM.
export function formatClock(totalMinutes) {
  const m = Math.floor(totalMinutes) % 1440;
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return hh + ':' + mm;
}

// Format a dollar amount with thousands separators, e.g. 1250 -> $1,250.
export function formatCash(n) {
  return '$' + Math.floor(n).toLocaleString('en-US');
}
