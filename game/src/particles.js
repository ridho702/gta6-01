// Pooled spark & smoke particle system for "Solmar Bay".
//
// Two fixed-capacity THREE.Points pools (sparks 400 + smoke 200 = 600 max).
// Every buffer is allocated exactly once in the constructor; the pools are
// ring buffers, so spawn and update never allocate anything new.
//
//  - sparks: small bright points, AdditiveBlending, fade to black.
//  - smoke:  larger soft puffs, NormalBlending, fade to the sky colour
//            through the uFadeToSky uniform as they die.
//
// Used by main.js for muzzle flash (flash), punch dust (burst), death /
// car explosions (explosion) and smoking-car exhaust (smoke).
//
// NOTE: pool storage lives in this.sparkPool / this.smokePool on purpose.
// A pool must never be stored under a name that collides with a method
// (this.smoke is the smoke() method; this.sparkPool is only storage).

const SPARK_MAX = 400;
const SMOKE_MAX = 200;

// Golden-hour sky over Solmar Bay (matches the 18:47 scene lighting).
const SKY_FADE = [0.62, 0.72, 0.82];

const VERT_SHADER = `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (240.0 / max(1.0, -mv.z));
  gl_Position = projectionMatrix * mv;
}
`;

const SPARK_FRAG_SHADER = `
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  float fall = smoothstep(0.5, 0.0, length(c));
  // Additive blending: fading alpha fades the spark to black.
  gl_FragColor = vec4(vColor * fall * vAlpha, 1.0);
}
`;

const SMOKE_FRAG_SHADER = `
uniform vec3 uFadeToSky;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  float fall = smoothstep(0.5, 0.08, length(c));
  // As the puff dies it dissolves into the sky colour.
  vec3 col = mix(vColor, uFadeToSky, 1.0 - vAlpha);
  gl_FragColor = vec4(col, fall * vAlpha * 0.55);
}
`;

export class Particles {
  constructor(scene, THREE) {
    this.THREE = THREE || (typeof globalThis !== 'undefined' ? globalThis.THREE : undefined);
    this.scene = scene;

    // Scratch numbers for spawn math, so no helper ever returns an object.
    this._dx = 0;
    this._dy = 0;
    this._dz = 0;
    this._cr = 1;
    this._cg = 1;
    this._cb = 1;

    this.sparkPool = this._makePool(SPARK_MAX, true);
    this.smokePool = this._makePool(SMOKE_MAX, false);

    this.scene.add(this.sparkPool.points);
    this.scene.add(this.smokePool.points);
  }

  // Allocate one pool: geometry attributes, per-particle state arrays and
  // the THREE.Points object. Called only from the constructor.
  _makePool(max, isSpark) {
    const T = this.THREE;
    const positions = new Float32Array(max * 3);
    const colors = new Float32Array(max * 3);
    const sizes = new Float32Array(max);
    const alphas = new Float32Array(max);
    const velocities = new Float32Array(max * 3);
    const life = new Float32Array(max);
    const maxLife = new Float32Array(max);
    const baseSize = new Float32Array(max);
    const grow = new Float32Array(max);
    const gravity = new Float32Array(max);

    // Park every slot far below the world so nothing shows before first use.
    for (let i = 0; i < max; i++) positions[i * 3 + 1] = -9999;

    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(positions, 3));
    geo.setAttribute('aColor', new T.BufferAttribute(colors, 3));
    geo.setAttribute('aSize', new T.BufferAttribute(sizes, 1));
    geo.setAttribute('aAlpha', new T.BufferAttribute(alphas, 1));

    const mat = new T.ShaderMaterial({
      vertexShader: VERT_SHADER,
      fragmentShader: isSpark ? SPARK_FRAG_SHADER : SMOKE_FRAG_SHADER,
      uniforms: isSpark ? {} : { uFadeToSky: { value: SKY_FADE } },
      blending: isSpark ? T.AdditiveBlending : T.NormalBlending,
      transparent: true,
      depthWrite: false,
    });

    const points = new T.Points(geo, mat);
    points.frustumCulled = false;

    return {
      max,
      points,
      geometry: geo,
      positions,
      colors,
      sizes,
      alphas,
      velocities,
      life,
      maxLife,
      baseSize,
      grow,
      gravity,
      cursor: 0,
    };
  }

  // Write one particle into the next ring-buffer slot. No allocation.
  _spawn(pool, x, y, z, vx, vy, vz, r, g, b, size, lifeSecs, growRate, grav) {
    const i = pool.cursor;
    pool.cursor = (pool.cursor + 1) % pool.max;
    const i3 = i * 3;
    pool.positions[i3] = x;
    pool.positions[i3 + 1] = y;
    pool.positions[i3 + 2] = z;
    pool.velocities[i3] = vx;
    pool.velocities[i3 + 1] = vy;
    pool.velocities[i3 + 2] = vz;
    pool.colors[i3] = r;
    pool.colors[i3 + 1] = g;
    pool.colors[i3 + 2] = b;
    pool.baseSize[i] = size;
    pool.sizes[i] = size;
    pool.grow[i] = growRate;
    pool.gravity[i] = grav;
    pool.life[i] = lifeSecs;
    pool.maxLife[i] = lifeSecs > 0 ? lifeSecs : 0.001;
    pool.alphas[i] = 1;
  }

  // Random unit direction * speed, written into this._dx/_dy/_dz.
  // No allocation: callers read the scratch fields right after the call.
  _randDir(speed) {
    const u = Math.random() * 2 - 1;
    const a = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    this._dx = Math.cos(a) * s * speed;
    this._dy = u * speed;
    this._dz = Math.sin(a) * s * speed;
  }

  // Split a hex colour into this._cr/_cg/_cb. No allocation.
  _setRgb(hex) {
    this._cr = ((hex >> 16) & 255) / 255;
    this._cg = ((hex >> 8) & 255) / 255;
    this._cb = (hex & 255) / 255;
  }

  // Generic coloured spark burst (punch dust in main.js).
  // opts: { count, colors: [hex, ...], speed, life, size }
  burst(pos, opts) {
    const o = opts || {};
    const count = o.count !== undefined ? o.count : 12;
    const colors = o.colors || [0xffffff];
    const speed = o.speed !== undefined ? o.speed : 3;
    const lifeSecs = o.life !== undefined ? o.life : 0.5;
    const size = o.size !== undefined ? o.size : 0.25;
    const px = pos ? pos.x || 0 : 0;
    const py = pos ? pos.y || 0 : 0;
    const pz = pos ? pos.z || 0 : 0;
    for (let n = 0; n < count; n++) {
      this._setRgb(colors[n % colors.length]);
      // Small upward bias so dust reads as a kicked-up puff.
      this._randDir(speed);
      this._spawn(
        this.sparkPool, px, py, pz,
        this._dx, this._dy + speed * 0.25, this._dz,
        this._cr, this._cg, this._cb,
        size * (0.7 + Math.random() * 0.6),
        lifeSecs * (0.7 + Math.random() * 0.6),
        0, -6
      );
    }
  }

  // Muzzle flash: one short, bright, warm spark pop at the gun.
  flash(pos) {
    const px = pos ? pos.x || 0 : 0;
    const py = pos ? pos.y || 0 : 0;
    const pz = pos ? pos.z || 0 : 0;
    const colors = [0xffe9a8, 0xffc040, 0xffffff, 0xff9040];
    for (let n = 0; n < 10; n++) {
      this._setRgb(colors[n % colors.length]);
      this._randDir(4);
      this._spawn(
        this.sparkPool, px, py, pz,
        this._dx, this._dy, this._dz,
        this._cr, this._cg, this._cb,
        0.55 * (0.7 + Math.random() * 0.6),
        0.12 * (0.7 + Math.random() * 0.6),
        0, 0
      );
    }
  }

  // Big explosion: a fireball of fast orange sparks plus slow dark smoke.
  explosion(pos) {
    const px = pos ? pos.x || 0 : 0;
    const py = pos ? pos.y || 0 : 0;
    const pz = pos ? pos.z || 0 : 0;
    const fire = [0xffd23e, 0xff9040, 0xff5a1e, 0xffe9a8, 0xffffff];
    for (let n = 0; n < 42; n++) {
      this._setRgb(fire[n % fire.length]);
      this._randDir(6 * (0.4 + Math.random() * 0.8));
      this._spawn(
        this.sparkPool, px, py, pz,
        this._dx, this._dy + 2, this._dz,
        this._cr, this._cg, this._cb,
        0.55 * (0.7 + Math.random() * 0.7),
        0.7 * (0.6 + Math.random() * 0.8),
        0, -7
      );
    }
    for (let n = 0; n < 14; n++) {
      const shade = 0.16 + Math.random() * 0.14;
      this._randDir(1.4);
      this._spawn(
        this.smokePool, px, py + 0.3, pz,
        this._dx * 0.5, 1.6 + Math.random() * 1.2, this._dz * 0.5,
        shade, shade, shade,
        1.3 * (0.8 + Math.random() * 0.5),
        1.3 * (0.7 + Math.random() * 0.6),
        1.6, 1.5
      );
    }
  }

  // Grey exhaust / damage smoke puff, rising and expanding as it fades.
  // opts: { count }
  smoke(pos, opts) {
    const o = opts || {};
    const count = o.count !== undefined ? o.count : 1;
    const px = pos ? pos.x || 0 : 0;
    const py = pos ? pos.y || 0 : 0;
    const pz = pos ? pos.z || 0 : 0;
    for (let n = 0; n < count; n++) {
      const shade = 0.32 + Math.random() * 0.18;
      this._spawn(
        this.smokePool,
        px + (Math.random() - 0.5) * 0.3,
        py + (Math.random() - 0.5) * 0.2,
        pz + (Math.random() - 0.5) * 0.3,
        (Math.random() - 0.5) * 0.5,
        1.1 + Math.random() * 0.7,
        (Math.random() - 0.5) * 0.5,
        shade, shade, shade,
        0.85 * (0.8 + Math.random() * 0.4),
        1.1 * (0.8 + Math.random() * 0.4),
        1.8, 0.8
      );
    }
  }

  // Advance both pools by dt seconds. No allocation.
  update(dt) {
    if (!dt || dt <= 0) return;
    this._updatePool(this.sparkPool, dt);
    this._updatePool(this.smokePool, dt);
  }

  _updatePool(pool, dt) {
    const pos = pool.positions;
    const vel = pool.velocities;
    const life = pool.life;
    const maxLife = pool.maxLife;
    const alphas = pool.alphas;
    const sizes = pool.sizes;
    const baseSize = pool.baseSize;
    const grow = pool.grow;
    const gravity = pool.gravity;
    for (let i = 0; i < pool.max; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      const i3 = i * 3;
      if (life[i] <= 0) {
        alphas[i] = 0;
        pos[i3 + 1] = -9999;
        continue;
      }
      vel[i3 + 1] += gravity[i] * dt;
      pos[i3] += vel[i3] * dt;
      pos[i3 + 1] += vel[i3 + 1] * dt;
      pos[i3 + 2] += vel[i3 + 2] * dt;
      const t = life[i] / maxLife[i];
      alphas[i] = t;
      sizes[i] = baseSize[i] * (1 + (1 - t) * grow[i]);
    }
    pool.geometry.attributes.position.needsUpdate = true;
    pool.geometry.attributes.aColor.needsUpdate = true;
    pool.geometry.attributes.aSize.needsUpdate = true;
    pool.geometry.attributes.aAlpha.needsUpdate = true;
  }
}
