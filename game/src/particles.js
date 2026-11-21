// particles.js — Solmar Bay pooled particle system.
// Two fixed-capacity THREE.Points pools (sparks 400 + smoke 200 = 600 max).
// Everything is allocated once in the constructor: positions, velocities,
// lifetimes and shader attributes live in preallocated Float32Arrays and
// are written in place. update() and the spawn methods allocate nothing
// (no `new` per frame, no per-frame geometry/material creation).
// Dead particles are hidden (alpha 0 / size 0) and their slot is reused
// by the next spawn via a ring-buffer cursor.

const SPARK_CAP = 400;
const SMOKE_CAP = 200;
const FLASH_COLORS = [0xffe9a8, 0xffc040, 0xfff6c0];
const EXPLOSION_COLORS = [0xffdd55, 0xff8a20, 0xff4a1a, 0xffe9a8];

// Sky/fog tint the smoke fades toward as it dies (matches scene fog).
const SKY_R = 0xc0 / 255;
const SKY_G = 0x78 / 255;
const SKY_B = 0x50 / 255;

const VERT = [
  'attribute float aSize;',
  'attribute float aAlpha;',
  'attribute vec3 aColor;',
  'varying float vAlpha;',
  'varying vec3 vColor;',
  'void main() {',
  '  vAlpha = aAlpha;',
  '  vColor = aColor;',
  '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
  '  gl_PointSize = aSize * (240.0 / max(0.1, -mv.z));',
  '  gl_Position = projectionMatrix * mv;',
  '}',
].join('\n');

const FRAG = [
  'uniform float uFadeToSky;',
  'varying float vAlpha;',
  'varying vec3 vColor;',
  'void main() {',
  '  vec2 c = gl_PointCoord - vec2(0.5);',
  '  float d = length(c);',
  '  if (d > 0.5) discard;',
  '  float soft = smoothstep(0.5, 0.1, d);',
  '  vec3 col = mix(vColor, vec3(' + SKY_R.toFixed(3) + ', ' + SKY_G.toFixed(3) + ', ' + SKY_B.toFixed(3) + '), uFadeToSky * (1.0 - vAlpha));',
  '  gl_FragColor = vec4(col, vAlpha * soft);',
  '}',
].join('\n');

function makePoints(THREE, cap, additive) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(cap * 3);
  const size = new Float32Array(cap);
  const alpha = new Float32Array(cap);
  const color = new Float32Array(cap * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
  geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: { uFadeToSky: { value: additive ? 0 : 1 } },
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 10;
  return { points: points, geo: geo, pos: pos, size: size, alpha: alpha, color: color };
}

function makeState(cap) {
  return {
    vel: new Float32Array(cap * 3),
    life: new Float32Array(cap),
    maxLife: new Float32Array(cap),
    size0: new Float32Array(cap),
    grow: new Float32Array(cap),
    drag: new Float32Array(cap),
    grav: new Float32Array(cap),
    cursor: 0,
  };
}

export class Particles {
  constructor(scene, THREE) {
    this.scene = scene;
    this.THREE = THREE;

    this.sparks = makePoints(THREE, SPARK_CAP, true);
    this.smokePool = makePoints(THREE, SMOKE_CAP, false);
    scene.add(this.sparks.points);
    scene.add(this.smokePool.points);

    this._sparkState = makeState(SPARK_CAP);
    this._smokeState = makeState(SMOKE_CAP);
    this._dir = new Float32Array(3); // reused scratch for _randDir()
  }

  // ---- internal spawn (no allocation; writes one ring-buffer slot) ----
  _spawn(pool, state, cap, x, y, z, vx, vy, vz, r, g, b, life, size, grow, drag, grav) {
    const i = state.cursor;
    state.cursor = (state.cursor + 1) % cap;
    const i3 = i * 3;
    pool.pos[i3] = x;
    pool.pos[i3 + 1] = y;
    pool.pos[i3 + 2] = z;
    state.vel[i3] = vx;
    state.vel[i3 + 1] = vy;
    state.vel[i3 + 2] = vz;
    pool.color[i3] = r;
    pool.color[i3 + 1] = g;
    pool.color[i3 + 2] = b;
    pool.size[i] = size;
    pool.alpha[i] = 1;
    state.life[i] = life;
    state.maxLife[i] = life > 0 ? life : 0.001;
    state.size0[i] = size;
    state.grow[i] = grow;
    state.drag[i] = drag;
    state.grav[i] = grav;
  }

  _spawnSpark(x, y, z, vx, vy, vz, hex, life, size) {
    this._spawn(
      this.sparks, this._sparkState, SPARK_CAP,
      x, y, z, vx, vy, vz,
      ((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255,
      life, size, 0, 3.0, 6.0
    );
  }

  _spawnSmoke(x, y, z, vx, vy, vz, shade, life, size, grow) {
    this._spawn(
      this.smokePool, this._smokeState, SMOKE_CAP,
      x, y, z, vx, vy, vz,
      shade, shade, shade,
      life, size, grow, 1.2, -0.6
    );
  }

  // Random direction, uniform over the sphere, written into the reused
  // scratch vector (no allocation). Callers must consume it immediately.
  _randDir() {
    const u = Math.random() * 2 - 1;
    const a = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    this._dir[0] = Math.cos(a) * s;
    this._dir[1] = u;
    this._dir[2] = Math.sin(a) * s;
    return this._dir;
  }

  // ---- public API (called from main.js) ----

  // Medium spray of sparks in the caller's colors (punch dust).
  burst(pos, opts) {
    opts = opts || {};
    const count = opts.count !== undefined ? opts.count : 8;
    const colors = opts.colors && opts.colors.length ? opts.colors : [0xffffff];
    const speed = opts.speed !== undefined ? opts.speed : 2.5;
    const life = opts.life !== undefined ? opts.life : 0.4;
    const size = opts.size !== undefined ? opts.size : 0.3;
    for (let n = 0; n < count; n++) {
      const d = this._randDir();
      const sp = speed * (0.5 + Math.random() * 0.8);
      const hex = colors[(Math.random() * colors.length) | 0];
      this._spawnSpark(
        pos.x, pos.y, pos.z,
        d[0] * sp, d[1] * sp + 0.8, d[2] * sp,
        hex, life * (0.7 + Math.random() * 0.6), size
      );
    }
  }

  // Tiny, very short spark spray (muzzle flash at the gun).
  flash(pos) {
    for (let n = 0; n < 6; n++) {
      const d = this._randDir();
      const sp = 2.5 + Math.random() * 2.5;
      this._spawnSpark(
        pos.x, pos.y, pos.z,
        d[0] * sp, d[1] * sp, d[2] * sp,
        FLASH_COLORS[(Math.random() * FLASH_COLORS.length) | 0],
        0.06 + Math.random() * 0.06,
        0.45
      );
    }
  }

  // Big burst: fast hot sparks + slow rising smoke (enemy death).
  explosion(pos) {
    for (let n = 0; n < 42; n++) {
      const d = this._randDir();
      const sp = 3 + Math.random() * 7;
      this._spawnSpark(
        pos.x, pos.y, pos.z,
        d[0] * sp, d[1] * sp + 2.0, d[2] * sp,
        EXPLOSION_COLORS[(Math.random() * EXPLOSION_COLORS.length) | 0],
        0.35 + Math.random() * 0.45,
        0.5 + Math.random() * 0.3
      );
    }
    for (let n = 0; n < 14; n++) {
      const d = this._randDir();
      const shade = 0.25 + Math.random() * 0.25;
      this._spawnSmoke(
        pos.x + d[0] * 0.3, pos.y + Math.random() * 0.4, pos.z + d[2] * 0.3,
        d[0] * 0.8, 1.2 + Math.random() * 1.2, d[2] * 0.8,
        shade, 1.2 + Math.random() * 0.6, 0.9, 2.2
      );
    }
  }

  // Slow grey puffs rising from a smoking engine.
  smoke(pos, opts) {
    opts = opts || {};
    const count = opts.count !== undefined ? opts.count : 2;
    for (let n = 0; n < count; n++) {
      const shade = 0.35 + Math.random() * 0.25;
      this._spawnSmoke(
        pos.x + (Math.random() - 0.5) * 0.4,
        pos.y + (Math.random() - 0.5) * 0.2,
        pos.z + (Math.random() - 0.5) * 0.4,
        (Math.random() - 0.5) * 0.5,
        0.8 + Math.random() * 0.8,
        (Math.random() - 0.5) * 0.5,
        shade, 1.0 + Math.random() * 0.7, 0.6, 1.8
      );
    }
  }

  // ---- per-frame advance (no allocation) ----
  _updatePool(pool, state, cap, dt) {
    const pos = pool.pos;
    const vel = state.vel;
    const life = state.life;
    const alpha = pool.alpha;
    const size = pool.size;
    let anyAlive = false;
    for (let i = 0; i < cap; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      if (life[i] <= 0) {
        life[i] = 0;
        alpha[i] = 0;
        size[i] = 0;
        continue;
      }
      anyAlive = true;
      const i3 = i * 3;
      const damp = 1 - state.drag[i] * dt;
      vel[i3] *= damp;
      vel[i3 + 1] = vel[i3 + 1] * damp - state.grav[i] * dt;
      vel[i3 + 2] *= damp;
      pos[i3] += vel[i3] * dt;
      pos[i3 + 1] += vel[i3 + 1] * dt;
      pos[i3 + 2] += vel[i3 + 2] * dt;
      const frac = life[i] / state.maxLife[i];
      alpha[i] = frac * frac;
      size[i] = state.size0[i] + state.grow[i] * (1 - frac);
    }
    if (anyAlive) {
      pool.geo.attributes.position.needsUpdate = true;
      pool.geo.attributes.aSize.needsUpdate = true;
      pool.geo.attributes.aAlpha.needsUpdate = true;
      pool.geo.attributes.aColor.needsUpdate = true;
    }
  }

  update(dt) {
    if (dt <= 0) return;
    if (dt > 0.1) dt = 0.1;
    this._updatePool(this.sparks, this._sparkState, SPARK_CAP, dt);
    this._updatePool(this.smokePool, this._smokeState, SMOKE_CAP, dt);
  }
}
