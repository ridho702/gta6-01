// particles.js — pooled spark & smoke particle systems for Solmar Bay.
// Fixed allocation: two THREE.Points pools (sparks 400 + smoke 200 = 600 max),
// no new allocations per frame. Per-particle size/alpha/color via a small
// ShaderMaterial so sparks can fade to black (additive) and smoke can fade
// toward the sky colour (normal blending).

const VERT = `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (240.0 / max(1.0, -mv.z));
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = `
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  float a = smoothstep(0.5, 0.05, d) * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor, a);
}
`;

function hexToRgb(hex) {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

function posOf(pos) {
  if (!pos) return [0, 0, 0];
  if (Array.isArray(pos)) return [pos[0] || 0, pos[1] || 0, pos[2] || 0];
  return [pos.x || 0, pos.y || 0, pos.z || 0];
}

export class Particles {
  constructor(scene, THREE) {
    this.THREE = THREE;
    this.scene = scene;
    // Sky colour the smoke fades toward (matches the dusk fog 0xc07850).
    this.sky = [0.75, 0.47, 0.31];
    this.sparkCap = 400;
    this.smokeCap = 200;
    this.sparkPool = this._makePool(this.sparkCap, THREE.AdditiveBlending, 'spark');
    this.smokePool = this._makePool(this.smokeCap, THREE.NormalBlending, 'smoke');
    scene.add(this.sparkPool.points);
    scene.add(this.smokePool.points);
  }

  _makePool(cap, blending, kind) {
    const THREE = this.THREE;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(cap * 3);
    const col = new Float32Array(cap * 3);
    const size = new Float32Array(cap);
    const alpha = new Float32Array(cap);
    for (let i = 0; i < cap; i++) pos[i * 3 + 1] = -9999;
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: blending,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    return {
      kind: kind,
      cap: cap,
      cursor: 0,
      points: points,
      geo: geo,
      pos: pos,
      col: col,
      size: size,
      alpha: alpha,
      vel: new Float32Array(cap * 3),
      life: new Float32Array(cap),
      maxLife: new Float32Array(cap),
      size0: new Float32Array(cap),
      size1: new Float32Array(cap),
      base: new Float32Array(cap * 3),
      grav: new Float32Array(cap),
      drag: new Float32Array(cap),
      alive: new Uint8Array(cap),
    };
  }

  _spawn(pool, x, y, z, vx, vy, vz, life, size0, size1, r, g, b, grav, drag) {
    const i = pool.cursor;
    pool.cursor = (i + 1) % pool.cap;
    const i3 = i * 3;
    pool.pos[i3] = x;
    pool.pos[i3 + 1] = y;
    pool.pos[i3 + 2] = z;
    pool.vel[i3] = vx;
    pool.vel[i3 + 1] = vy;
    pool.vel[i3 + 2] = vz;
    pool.life[i] = life;
    pool.maxLife[i] = life;
    pool.size0[i] = size0;
    pool.size1[i] = size1;
    pool.base[i3] = r;
    pool.base[i3 + 1] = g;
    pool.base[i3 + 2] = b;
    pool.col[i3] = r;
    pool.col[i3 + 1] = g;
    pool.col[i3 + 2] = b;
    pool.size[i] = size0;
    pool.alpha[i] = pool.kind === 'smoke' ? 0 : 1;
    pool.grav[i] = grav;
    pool.drag[i] = drag;
    pool.alive[i] = 1;
  }

  // Fountain of glowing sparks. opts: count, colors (array of hex) / color,
  // speed, life, size, gravity (default -12, sparks fall).
  burst(pos, opts) {
    opts = opts || {};
    const p = posOf(pos);
    const count = opts.count || 24;
    const colors = opts.colors || (opts.color !== undefined ? [opts.color] : [0xffc040, 0xff7020, 0xffd880]);
    const speed = opts.speed || 6;
    const life = opts.life || 0.7;
    const size = opts.size || 0.35;
    const grav = opts.gravity !== undefined ? opts.gravity : -12;
    for (let n = 0; n < count; n++) {
      const c = hexToRgb(colors[(Math.random() * colors.length) | 0]);
      const vx = (Math.random() - 0.5) * 2 * speed;
      const vy = Math.random() * speed * 0.9 + speed * 0.2;
      const vz = (Math.random() - 0.5) * 2 * speed;
      this._spawn(
        this.sparkPool, p[0], p[1], p[2], vx, vy, vz,
        life * (0.6 + Math.random() * 0.7),
        size * (0.7 + Math.random() * 0.6), size * 0.2,
        c[0], c[1], c[2], grav, 0.6
      );
    }
  }

  // Rising grey smoke puff that grows and fades toward the sky colour.
  // opts: count, life, size.
  smoke(pos, opts) {
    opts = opts || {};
    const p = posOf(pos);
    const count = opts.count || 6;
    const life = opts.life || 2.2;
    const size = opts.size || 1.6;
    for (let n = 0; n < count; n++) {
      const g = 0.42 + Math.random() * 0.22;
      this._spawn(
        this.smokePool,
        p[0] + (Math.random() - 0.5) * 0.6,
        p[1] + (Math.random() - 0.5) * 0.3,
        p[2] + (Math.random() - 0.5) * 0.6,
        (Math.random() - 0.5) * 0.8,
        0.8 + Math.random() * 0.9,
        (Math.random() - 0.5) * 0.8,
        life * (0.7 + Math.random() * 0.6),
        size * (0.8 + Math.random() * 0.5),
        size * 2.4 + Math.random() * 1.5,
        g, g, g, 0.6, 0.35
      );
    }
  }

  // Short-lived yellow-white muzzle flash.
  flash(pos) {
    this.burst(pos, {
      count: 12,
      colors: [0xffffff, 0xffe9a0],
      speed: 2.5,
      life: 0.2,
      size: 0.9,
      gravity: 0,
    });
  }

  // Orange/red burst + smoke + flash.
  explosion(pos) {
    const p = posOf(pos);
    this.flash({ x: p[0], y: p[1], z: p[2] });
    this.burst({ x: p[0], y: p[1], z: p[2] }, {
      count: 36,
      colors: [0xff8020, 0xffc040, 0xff3020],
      speed: 8,
      life: 0.9,
      size: 0.5,
    });
    this.smoke({ x: p[0], y: p[1] + 0.4, z: p[2] }, { count: 12, life: 2.6 });
  }

  _updatePool(pool, dt) {
    const sky = this.sky;
    for (let i = 0; i < pool.cap; i++) {
      if (!pool.alive[i]) continue;
      pool.life[i] -= dt;
      if (pool.life[i] <= 0) {
        pool.alive[i] = 0;
        pool.alpha[i] = 0;
        pool.pos[i * 3 + 1] = -9999;
        continue;
      }
      const frac = 1 - pool.life[i] / pool.maxLife[i];
      const i3 = i * 3;
      const dragF = Math.max(0, 1 - pool.drag[i] * dt);
      pool.vel[i3] *= dragF;
      pool.vel[i3 + 1] = pool.vel[i3 + 1] * dragF + pool.grav[i] * dt;
      pool.vel[i3 + 2] *= dragF;
      pool.pos[i3] += pool.vel[i3] * dt;
      pool.pos[i3 + 1] += pool.vel[i3 + 1] * dt;
      pool.pos[i3 + 2] += pool.vel[i3 + 2] * dt;
      pool.size[i] = pool.size0[i] + (pool.size1[i] - pool.size0[i]) * frac;
      if (pool.kind === 'spark') {
        pool.alpha[i] = 1 - frac;
        const dim = 1 - frac * 0.6;
        pool.col[i3] = pool.base[i3] * dim;
        pool.col[i3 + 1] = pool.base[i3 + 1] * dim;
        pool.col[i3 + 2] = pool.base[i3 + 2] * dim;
      } else {
        // Smoke: fade in fast, fade out slowly, colour drifts to sky colour.
        const fadeIn = Math.min(1, frac * 6);
        pool.alpha[i] = (1 - frac) * 0.55 * fadeIn;
        pool.col[i3] = pool.base[i3] + (sky[0] - pool.base[i3]) * frac;
        pool.col[i3 + 1] = pool.base[i3 + 1] + (sky[1] - pool.base[i3 + 1]) * frac;
        pool.col[i3 + 2] = pool.base[i3 + 2] + (sky[2] - pool.base[i3 + 2]) * frac;
      }
    }
    pool.geo.attributes.position.needsUpdate = true;
    pool.geo.attributes.aColor.needsUpdate = true;
    pool.geo.attributes.aSize.needsUpdate = true;
    pool.geo.attributes.aAlpha.needsUpdate = true;
  }

  update(dt) {
    if (!dt || dt <= 0) return;
    if (dt > 0.1) dt = 0.1;
    this._updatePool(this.sparkPool, dt);
    this._updatePool(this.smokePool, dt);
  }
}
