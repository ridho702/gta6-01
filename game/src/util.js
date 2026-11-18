// Solmar Bay — shared math, seeded random and procedural canvas textures.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2d = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
export function angleLerp(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + d * t;
}
export function angleDiff(a, b) {
  return ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
}
// Procedural building facade texture: coloured wall + lit/unlit windows.
export function facadeTexture(base, lit, seed) {
  const rnd = mulberry32(seed);
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 128, 256);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  for (let y = 0; y < 256; y += 32) g.fillRect(0, y, 128, 3);
  for (let y = 14; y < 250; y += 32) for (let x = 12; x < 120; x += 28) {
    const on = rnd() < lit;
    g.fillStyle = on ? '#ffd98a' : (rnd() < 0.5 ? '#1c2b3a' : '#2b4258');
    g.fillRect(x, y, 18, 20);
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x, y, 18, 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// Asphalt with lane dashes, for road strips.
export function roadTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#2e3138'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#3a3e46';
  for (let i = 0; i < 40; i++) g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  g.fillStyle = '#e8c33c'; g.fillRect(62, 8, 4, 40); g.fillRect(62, 80, 4, 40);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export function groundTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#7a8a5a'; g.fillRect(0, 0, 256, 256);
  const rnd = mulberry32(99);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)';
    g.fillRect(rnd() * 256, rnd() * 256, 3, 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(24, 24); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
