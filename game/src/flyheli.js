// flyheli.js — Sprint 14: flyable "SEAGULL" helicopter + police chase heli (AIR-2).
//
// A civilian helicopter sits on a marked helipad on the beach by the pier
// (x 20, z 282). Walk up and press E to climb in; W/S pitch fore/aft, A/D
// yaw, Space climbs, C descends, E gets out again once landed. The rotor
// spins up on entry and spools down when parked. While airborne the player
// position tracks the helicopter, so the chase camera, the police and the
// HUD all follow it for free.
//
// At wanted >= 3 a second helicopter — SBPD AIR-2, dark navy with a blue
// stripe — spawns and hunts the player: it hovers overhead, pins a
// spotlight cone and a light pool on the player's position, and if the
// player is flying it climbs up and chases in the air. It leaves when the
// heat drops below 3 stars.
//
// Integration (coordinator, main.js): construct once, add to `game`, call
// update(dt, input, { player, police, game }) every frame after
// player.update(). Never touches traffic / parked / pedestrian counts.

const PAD_X = 20;
const PAD_Z = 282;
const MAX_ALT = 110;
const BOUND_X = 272;
const BOUND_Z_MIN = -272;
const BOUND_Z_MAX = 346;

const CIVIL = {
  body: 0xe9e2d2, stripe: 0xd84a20, glass: 0x8ec8e0, dark: 0x2a2a30,
  skid: 0x3a3f46, blade: 0x1c1c22, beacon: 0xff3020,
};
const COP = {
  body: 0x202c40, stripe: 0x2a6ad8, glass: 0x6a9ac8, dark: 0x14181f,
  skid: 0x101418, blade: 0x0c0e12, beacon: 0x2040ff,
};

function _lambert(THREE, color) {
  return new THREE.MeshLambertMaterial({ color: color });
}

function _basic(THREE, color, extra) {
  const opts = { color: color };
  if (extra) for (const k in extra) opts[k] = extra[k];
  return new THREE.MeshBasicMaterial(opts);
}

function _box(THREE, parent, w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

// One helicopter mesh, painted from a palette. The civilian SEAGULL and the
// police AIR-2 share this builder; only the colours differ.
function _buildHeli(THREE, pal) {
  const g = new THREE.Group();
  const bodyMat = _lambert(THREE, pal.body);
  const stripeMat = _lambert(THREE, pal.stripe);
  const glassMat = _lambert(THREE, pal.glass);
  const darkMat = _lambert(THREE, pal.dark);
  const bladeMat = _lambert(THREE, pal.blade);

  // Main cabin: a long cream/navy box with a glass nose and a side stripe.
  _box(THREE, g, 2.3, 1.5, 4.4, bodyMat, 0, 0, 0);
  _box(THREE, g, 1.9, 0.85, 1.2, glassMat, 0, 0.3, 1.75);
  _box(THREE, g, 2.36, 0.3, 3.6, stripeMat, 0, -0.35, 0.1);
  // Roof hump over the cabin.
  _box(THREE, g, 1.6, 0.4, 2.2, bodyMat, 0, 0.9, -0.4);

  // Tail boom (tapered cylinder) + vertical fin + stabiliser bar.
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 4.8, 8), bodyMat);
  boom.rotation.x = Math.PI / 2;
  boom.position.set(0, 0.45, -4.2);
  g.add(boom);
  _box(THREE, g, 0.14, 1.5, 1.0, stripeMat, 0, 1.1, -6.4);
  _box(THREE, g, 2.2, 0.1, 0.5, darkMat, 0, 0.7, -5.6);

  // Landing skids: two rails with short struts up to the belly.
  for (const sx of [-1.0, 1.0]) {
    _box(THREE, g, 0.12, 0.12, 3.4, darkMat, sx, -1.05, 0.2);
    _box(THREE, g, 0.1, 0.5, 0.1, darkMat, sx, -0.78, 1.2);
    _box(THREE, g, 0.1, 0.5, 0.1, darkMat, sx, -0.78, -0.8);
  }

  // Mast + three-blade main rotor (blades 60 degrees apart).
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.7, 8), darkMat);
  mast.position.y = 1.1;
  g.add(mast);
  const rotor = new THREE.Group();
  rotor.position.y = 1.5;
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(10.8, 0.07, 0.5), bladeMat);
    blade.rotation.y = (i * Math.PI) / 3;
    rotor.add(blade);
  }
  g.add(rotor);
  // Blur disc fades in as the rotor spins up.
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(5.4, 24),
    _basic(THREE, 0x000000, { transparent: true, opacity: 0.05, side: THREE.DoubleSide })
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 1.48;
  g.add(disc);

  // Tail rotor: two crossed paddles spinning on the x axle.
  const tailRotor = new THREE.Group();
  tailRotor.position.set(0.3, 0.9, -6.4);
  const paddleA = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.9, 0.25), bladeMat);
  tailRotor.add(paddleA);
  const paddleB = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.25, 1.9), bladeMat);
  tailRotor.add(paddleB);
  g.add(tailRotor);

  // Roof beacon + nose landing lights.
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), _basic(THREE, pal.beacon));
  beacon.position.set(0, 1.25, -0.5);
  g.add(beacon);
  for (const lx of [-0.6, 0.6]) {
    _box(THREE, g, 0.3, 0.14, 0.08, _basic(THREE, 0xfff2b0), lx, -0.5, 2.22);
  }

  return { group: g, rotor: rotor, tailRotor: tailRotor, disc: disc, beacon: beacon };
}

export class FlyHeli {
  constructor(scene, THREE, opts) {
    this.scene = scene;
    this.THREE = THREE;
    const o = opts || {};
    this.player = o.player || null;
    this.police = o.police || null;
    this.game = o.game || null;

    // --- flight state ---
    this.pos = new THREE.Vector3(PAD_X, 0, PAD_Z);
    this.heading = 0;
    this.fwdSpeed = 0;
    this.vertSpeed = 0;
    this.rotorSpeed = 0;
    this.flying = false;
    this.landed = true;
    this._t = 0;
    this._prevKeys = new Set();
    this._lastHint = '';

    // --- helipad: dark disc, yellow ring, painted H, corner lights, windsock ---
    const pad = new THREE.Group();
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(7, 28),
      _lambert(THREE, 0x33383f)
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.03;
    pad.add(disc);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(5.8, 6.6, 28),
      _basic(THREE, 0xe8c832)
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    pad.add(ring);
    const hMat = _basic(THREE, 0xe8c832);
    _box(THREE, pad, 0.6, 0.06, 3.2, hMat, -1.3, 0.05, 0);
    _box(THREE, pad, 0.6, 0.06, 3.2, hMat, 1.3, 0.05, 0);
    _box(THREE, pad, 2.0, 0.06, 0.6, hMat, 0, 0.05, 0);
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 8, 6),
        _basic(THREE, 0xffe14d)
      );
      lamp.position.set(Math.cos(a) * 6.6, 0.15, Math.sin(a) * 6.6);
      pad.add(lamp);
    }
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 4.2, 8),
      _lambert(THREE, 0xcccccc)
    );
    pole.position.set(8, 2.1, 0);
    pad.add(pole);
    const sock = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.6, 8), _lambert(THREE, 0xff7a20));
    sock.rotation.z = Math.PI / 2;
    sock.position.set(7.2, 4.0, 0);
    pad.add(sock);
    pad.position.set(PAD_X, 0, PAD_Z);
    scene.add(pad);
    this.pad = pad;

    // --- the flyable SEAGULL ---
    const built = _buildHeli(THREE, CIVIL);
    this.heli = built.group;
    this.rotor = built.rotor;
    this.tailRotor = built.tailRotor;
    this.disc = built.disc;
    this.beacon = built.beacon;
    this.heli.position.set(PAD_X, 0, PAD_Z);
    scene.add(this.heli);
    // Minimap compat: hud reads .pos on tracked objects.
    this.heli.pos = this.pos;

    // --- police chase heli AIR-2 (hidden until wanted >= 3) ---
    const cop = _buildHeli(THREE, COP);
    this.copHeli = cop.group;
    this.copRotor = cop.rotor;
    this.copTailRotor = cop.tailRotor;
    this.copBeacon = cop.beacon;
    // Spotlight cone: 30 tall, apex at the heli, base on the ground.
    this.copCone = new THREE.Mesh(
      new THREE.ConeGeometry(7, 30, 18, 1, true),
      _basic(THREE, 0xfff2b0, { transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false })
    );
    this.copCone.position.y = -15;
    this.copHeli.add(this.copCone);
    // Ground light pool (scene child, stays on the ground under the player).
    this.copPool = new THREE.Mesh(
      new THREE.CircleGeometry(8.5, 24),
      _basic(THREE, 0xffe9a0, { transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false })
    );
    this.copPool.rotation.x = -Math.PI / 2;
    this.copPool.position.y = 0.07;
    this.copPool.visible = false;
    scene.add(this.copPool);
    this.copPos = new THREE.Vector3(0, 30, 0);
    this.copHeli.pos = this.copPos;
    this.copActive = false;
    this.copHeli.visible = false;
    scene.add(this.copHeli);

    // --- HUD hint line (own DOM node, no hud.js edit needed) ---
    const hint = document.createElement('div');
    hint.id = 'hud-heli';
    hint.style.cssText = 'position:fixed;left:50%;bottom:17%;transform:translateX(-50%);'
      + 'background:rgba(0,0,0,0.55);color:#fff;font:13px monospace;padding:6px 12px;'
      + 'border-radius:4px;display:none;z-index:30;pointer-events:none;white-space:nowrap;';
    document.body.appendChild(hint);
    this.hintEl = hint;
  }

  _down(input, code) {
    if (!input) return false;
    if (typeof input.isDown === 'function') return !!input.isDown(code);
    if (input.keys && typeof input.keys.has === 'function') return input.keys.has(code);
    return false;
  }

  // Own edge detection: the main loop clears Input.pressed at end of frame,
  // so a later update() call cannot rely on wasPressed().
  _pressed(input, code) {
    const now = this._down(input, code);
    const was = this._prevKeys.has(code);
    if (now) this._prevKeys.add(code);
    else this._prevKeys.delete(code);
    return now && !was;
  }

  _distToPad(px, pz) {
    const dx = px - PAD_X;
    const dz = pz - PAD_Z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  _toast(msg) {
    try {
      const g = this.game;
      if (g && typeof g.toast === 'function') g.toast(msg);
      else if (g && g.hud && typeof g.hud.toast === 'function') g.hud.toast(msg);
    } catch (e) {}
  }

  heliPos() {
    return { x: this.pos.x, y: this.pos.y, z: this.pos.z, flying: this.flying };
  }

  policePos() {
    if (!this.copActive) return null;
    return { x: this.copPos.x, y: this.copPos.y, z: this.copPos.z };
  }

  nearHeli() {
    const p = this.player;
    if (!p || !p.pos) return false;
    return !this.flying && this._distToPad(p.pos.x, p.pos.z) < 5;
  }

  enterHeli() {
    const p = this.player;
    if (!p || this.flying) return false;
    if (p.mode && p.mode !== 'foot') return false;
    if (this._distToPad(p.pos.x, p.pos.z) > 5) return false;
    this.flying = true;
    this.landed = this.pos.y <= 0.5;
    p.mode = 'heli';
    if (p.mesh) p.mesh.visible = false;
    p.pos.set(this.pos.x, this.pos.y, this.pos.z);
    if (typeof p.angle === 'number') p.angle = this.heading;
    this._toast('Helikopter SEAGULL — W/S maju · A/D belok · SPACE naik · C turun · E keluar');
    return true;
  }

  exitHeli() {
    const p = this.player;
    if (!p || !this.flying) return false;
    if (this.pos.y > 0.5) {
      this._toast('Mendarat dulu untuk keluar!');
      return false;
    }
    this.flying = false;
    this.landed = true;
    this.fwdSpeed = 0;
    this.vertSpeed = 0;
    const outX = this.pos.x + Math.cos(this.heading) * 3.2;
    const outZ = this.pos.z - Math.sin(this.heading) * 3.2;
    p.pos.set(outX, 0, outZ);
    if (typeof p.angle === 'number') p.angle = this.heading;
    p.mode = 'foot';
    if (p.mesh) {
      p.mesh.visible = true;
      p.mesh.position.set(outX, 0, outZ);
      p.mesh.rotation.y = this.heading;
    }
    return true;
  }

  // Drop the player out (e.g. died mid-air) without touching the heli.
  forceExit() {
    const p = this.player;
    if (!p || !this.flying) return;
    this.flying = false;
    this.landed = this.pos.y <= 0.5;
    this.fwdSpeed = 0;
    this.vertSpeed = 0;
    p.pos.set(this.pos.x, 0, this.pos.z);
    p.mode = 'foot';
    if (p.mesh) {
      p.mesh.visible = true;
      p.mesh.position.set(this.pos.x, 0, this.pos.z);
    }
  }

  _updateFlight(dt, input) {
    const w = this._down(input, 'KeyW');
    const s = this._down(input, 'KeyS');
    const a = this._down(input, 'KeyA');
    const d = this._down(input, 'KeyD');
    const up = this._down(input, 'Space');
    const down = this._down(input, 'KeyC');

    // Yaw.
    const steer = (d ? 1 : 0) - (a ? 1 : 0);
    if (steer !== 0) this.heading += steer * 1.5 * dt;

    // Fore/aft speed with accel, coast and reverse.
    if (w) this.fwdSpeed = Math.min(26, this.fwdSpeed + 14 * dt);
    else if (s) this.fwdSpeed = Math.max(-8, this.fwdSpeed - 12 * dt);
    else if (this.fwdSpeed > 0) this.fwdSpeed = Math.max(0, this.fwdSpeed - 8 * dt);
    else if (this.fwdSpeed < 0) this.fwdSpeed = Math.min(0, this.fwdSpeed + 8 * dt);

    // Vertical: hold altitude when neither key is held (hover).
    const wantVert = up ? 9 : down ? -8 : 0;
    this.vertSpeed += (wantVert - this.vertSpeed) * Math.min(1, dt * 4);

    this.pos.x += Math.sin(this.heading) * this.fwdSpeed * dt;
    this.pos.z += Math.cos(this.heading) * this.fwdSpeed * dt;
    this.pos.y += this.vertSpeed * dt;
    if (this.pos.y < 0) { this.pos.y = 0; this.vertSpeed = 0; }
    if (this.pos.y > MAX_ALT) { this.pos.y = MAX_ALT; this.vertSpeed = 0; }
    if (this.pos.x < -BOUND_X) this.pos.x = -BOUND_X;
    if (this.pos.x > BOUND_X) this.pos.x = BOUND_X;
    if (this.pos.z < BOUND_Z_MIN) this.pos.z = BOUND_Z_MIN;
    if (this.pos.z > BOUND_Z_MAX) this.pos.z = BOUND_Z_MAX;
    this.landed = this.pos.y <= 0.01 && Math.abs(this.fwdSpeed) < 2;

    // Rotor spools up in flight, spools down when parked.
    const targetRotor = this.flying ? 20 : 0;
    this.rotorSpeed += (targetRotor - this.rotorSpeed) * Math.min(1, dt * 1.2);
    if (this.rotor) this.rotor.rotation.y += this.rotorSpeed * dt;
    if (this.tailRotor) this.tailRotor.rotation.x += this.rotorSpeed * 1.4 * dt;
    if (this.disc) {
      this.disc.material.opacity = 0.05 + 0.1 * Math.min(1, this.rotorSpeed / 20);
    }
    if (this.beacon) this.beacon.visible = Math.sin(this._t * 6) > -0.2;

    // Attitude: nose down with forward speed, slight bank into turns.
    const pitch = 0.16 * Math.max(-0.3, Math.min(1, this.fwdSpeed / 26));
    const roll = -0.12 * steer * Math.min(1, Math.abs(this.fwdSpeed) / 10);
    this.heli.rotation.set(pitch, this.heading, roll);
    this.heli.position.set(this.pos.x, this.pos.y, this.pos.z);

    // Player rides along: position, heading and speed track the heli.
    const p = this.player;
    if (p && p.pos) {
      p.pos.set(this.pos.x, this.pos.y, this.pos.z);
      if (typeof p.angle === 'number') p.angle = this.heading;
      if (typeof p.speed === 'number') p.speed = Math.abs(this.fwdSpeed);
      if (p.mesh) p.mesh.visible = false;
    }
  }

  _updateCop(dt, playerPos) {
    const pol = this.police;
    const want = pol && typeof pol.wanted === 'number' ? pol.wanted : 0;
    if (want < 3) {
      if (this.copActive) {
        this.copActive = false;
        this.copHeli.visible = false;
        this.copPool.visible = false;
      }
      return;
    }
    const tx = playerPos ? playerPos.x : 0;
    const ty = playerPos ? (playerPos.y || 0) : 0;
    const tz = playerPos ? playerPos.z : 0;
    if (!this.copActive) {
      this.copActive = true;
      this.copHeli.visible = true;
      this.copPool.visible = true;
      this.copPos.set(tx + 36, Math.max(30, ty + 12), tz - 20);
    }
    // Chase the player: 30 m/s horizontally, climb to hover above them.
    // Staging only: showcaseOffset (set by a screenshot stage) hovers the
    // heli off to one side so it stays in frame instead of overhead.
    const ox = this.showcaseOffset ? this.showcaseOffset.x : 0;
    const oz = this.showcaseOffset ? this.showcaseOffset.z : 0;
    const dx = (tx + ox) - this.copPos.x;
    const dz = (tz + oz) - this.copPos.z;
    const dh = Math.sqrt(dx * dx + dz * dz);
    if (dh > 0.5) {
      const step = Math.min(dh, 30 * dt);
      this.copPos.x += (dx / dh) * step;
      this.copPos.z += (dz / dh) * step;
      this.copHeli.rotation.y = Math.atan2(dx, dz);
    }
    const wantY = Math.max(26, ty + 9);
    const dy = wantY - this.copPos.y;
    this.copPos.y += Math.max(-12 * dt, Math.min(12 * dt, dy));
    this.copHeli.position.set(this.copPos.x, this.copPos.y, this.copPos.z);

    // Rotor + beacons.
    if (this.copRotor) this.copRotor.rotation.y += dt * 20;
    if (this.copTailRotor) this.copTailRotor.rotation.x += dt * 28;
    if (this.copBeacon) this.copBeacon.visible = Math.sin(this._t * 6) > 0;
    // Spotlight cone stretches from the heli down to the ground.
    if (this.copCone) {
      const h = Math.max(1, this.copPos.y);
      this.copCone.scale.y = h / 30;
      this.copCone.position.y = -h / 2;
    }
    // Light pool stays on the ground under the player.
    if (this.copPool) this.copPool.position.set(tx, 0.07, tz);
  }

  _updateHint() {
    let text = '';
    if (this.flying) {
      const alt = Math.round(this.pos.y);
      const spd = Math.round(Math.abs(this.fwdSpeed) * 3.6);
      text = 'SEAGULL · ALT ' + alt + 'm · ' + spd + ' km/h — W/S maju · A/D belok · SPACE naik · C turun · E keluar';
    } else if (this.nearHeli()) {
      text = 'Tekan [E] — Naik helikopter SEAGULL';
    }
    if (text !== this._lastHint) {
      this._lastHint = text;
      if (this.hintEl) {
        this.hintEl.textContent = text;
        this.hintEl.style.display = text ? 'block' : 'none';
      }
    }
  }

  update(dt, input, ctx) {
    if (typeof dt !== 'number' || !isFinite(dt) || dt <= 0) dt = 0.016;
    if (dt > 0.05) dt = 0.05;
    this._t += dt;
    const c = ctx || {};
    if (c.player) this.player = c.player;
    if (c.police) this.police = c.police;
    if (c.game) this.game = c.game;
    const game = this.game;
    const p = this.player;

    // Only play in the live game: menu / pause / wasted leave the heli parked.
    if (game && game.state && game.state !== 'playing') {
      this._updateHint();
      return;
    }
    // Died mid-air: drop out of the heli so respawn is clean.
    if (this.flying && p && typeof p.health === 'number' && p.health <= 0) {
      this.forceExit();
    }

    // E: enter when on foot by the pad, exit when landed. Shops and dialogue
    // own E when they are open, so the heli never steals that press.
    let busy = false;
    try {
      if (game) {
        if (game.shops && game.shops.open) busy = true;
        if (game.dialogOpen || (game.hud && game.hud.dialogOpen)) busy = true;
        if (game.missions && game.missions.dialogOpen) busy = true;
      }
    } catch (e) {}
    if (!busy && this._pressed(input, 'KeyE')) {
      if (this.flying) this.exitHeli();
      else if (p && p.mode === 'foot') this.enterHeli();
    }

    if (this.flying) this._updateFlight(dt, input);
    else {
      // Parked: rotor idles down, heli sits on the pad.
      this.rotorSpeed += (0 - this.rotorSpeed) * Math.min(1, dt * 1.2);
      if (this.rotor) this.rotor.rotation.y += this.rotorSpeed * dt;
      if (this.tailRotor) this.tailRotor.rotation.x += this.rotorSpeed * 1.4 * dt;
      if (this.disc) this.disc.material.opacity = 0.05 + 0.1 * Math.min(1, this.rotorSpeed / 20);
      if (this.beacon) this.beacon.visible = Math.sin(this._t * 6) > -0.2;
      this.heli.rotation.set(0, this.heading, 0);
      this.heli.position.set(this.pos.x, this.pos.y, this.pos.z);
    }

    const pp = p && p.pos ? p.pos : null;
    this._updateCop(dt, pp);
    this._updateHint();
  }
}
