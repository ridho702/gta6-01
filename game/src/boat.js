// boat.js — Sprint 15: drivable "BAY RUNNER" speedboat at the harbour pier.
//
// The boat is moored beside the south pier (see DOCK below). Walk to the
// end of the pier and press E to climb aboard; W/S throttle forward and
// reverse, A/D steer, E steps back onto the pier — but only while the boat
// is close to the dock, so it can never be abandoned out at sea. While
// aboard, the player position tracks the boat, so the chase camera, the
// police and the HUD all follow it for free (same trick as the heli).
//
// The boat never leaves the water: every move is checked against
// city.js isInWater(), and the pier strip itself blocks the hull, so the
// boat cannot beach itself or drive up onto the deck.
//
// ---------------------------------------------------------------------------
// WIRE-UP CONTRACT — coordinator, paste these into main.js (do NOT edit
// this file to wire it up; the lines below are the exact integration):
//
//   1. Import (next to the FlyHeli import):
//        import { Boat } from './boat.js';
//
//   2. Construct once, right after the flyHeli construction, and expose it:
//        const boat = new Boat(scene, THREE, { player: player, game: game, particles: particles });
//        game.boat = boat;
//
//   3. Step it every frame in animate(), in the 'playing' branch, right
//      after the flyHeli.update() call:
//        if (boat && typeof boat.update === 'function') {
//          try { boat.update(dt, input, { player: player, police: police, game: game }); } catch (e) {}
//        }
//
//   4. E key: the boat owns its own E handling inside update() (edge
//      detected, same as the heli), so main.js needs NO new E branch.
//      No parked car sits within 4.5 m of the dock — the nearest is the
//      'Coast Runner' bike at (4, 322), ~14 m away — so main's
//      enter/exit-car E block never steals the press at the pier.
//      Shops and dialogue still own E first; the boat checks that and
//      stays quiet while a shop panel or dialogue is open.
//
//   5. Respawn (in respawn(), next to the flyHeli.forceExit() call):
//        if (boat && typeof boat.forceExit === 'function') {
//          try { boat.forceExit(); } catch (e) {}
//        }
//      forceExit() drops the player on the pier and re-moors the boat.
//
//   6. HUD (hud.js — car panel block, next to the player.mode === 'car'
//      branch; no new DOM ids needed, the existing panel is reused):
//        else if (player.mode === 'boat' && game.boat) {
//          carPanel.style.display = 'block';
//          if (nameEl) nameEl.textContent = 'BAY RUNNER';
//          if (condEl) condEl.textContent = 'SPEED ' + Math.round(Math.abs(game.boat.speed) * 3.6) + ' km/h';
//          if (gearEl) gearEl.textContent = 'W/S gas · A/D belok · E turun di dermaga';
//        }
//      Speedometer (same file, next to the player.mode === 'car' check):
//        if (player.mode === 'car' || player.mode === 'boat') { ... show hud-speed ... }
//      with the speed value taken from game.boat.speed when in the boat.
//      (The boat also paints its own hint line — see the hud-boat node
//      below — so the game is playable even before the hud.js edit lands.)
//
//   7. Minimap (hud.js _drawMinimap(), right after the flyHeli block):
//        if (game.boat) {
//          const bp = game.boat.boatPos ? game.boat.boatPos() : null;
//          if (bp) {
//            ctx.fillStyle = '#7fd4ff';
//            ctx.beginPath();
//            ctx.arc(toX(bp.x), toY(bp.z), 4, 0, Math.PI * 2);
//            ctx.fill();
//          }
//        }
// ---------------------------------------------------------------------------

import { isInWater } from './city.js';

// Mooring spot: east side of the pier head, just off the deck. The pier
// deck spans x -7..7, z 260..344 (city.js); the shack stands at (0, 336).
// DOCK (10, 336) is in open water (isInWater: z > 300 and |x| >= 7) and
// only ~3 m from the deck edge, so the player steps aboard from the pier.
export const DOCK = { x: 10, z: 336 };

const BOAT_NAME = 'BAY RUNNER';
const MAX_SPEED = 32; // m/s forward (~115 km/h)
const MAX_REVERSE = -10; // m/s astern
const ACCEL = 11; // m/s^2 on the throttle
const REVERSE_ACCEL = 9; // m/s^2 astern
const DRAG = 5; // m/s^2 coast-down when neither W nor S is held
const TURN_RATE = 1.25; // rad/s at full rudder and way on
const BOARD_DIST = 5; // how close the player must stand to climb aboard
const EXIT_DIST = 9; // boat must be this close to DOCK to step off
const WAKE_SPEED = 4; // m/s above which the stern throws a wake
const MIN_X = -340;
const MAX_X = 340;
const MIN_Z = 306; // stays off the beach (water starts at z > 300)
const MAX_Z = 700; // inside the ocean plane (z 302..722 in city.js)

function _lambert(THREE, color) {
  return new THREE.MeshLambertMaterial({ color: color });
}

function _basic(THREE, color, extra) {
  const opts = { color: color };
  if (extra) {
    for (const k in extra) opts[k] = extra[k];
  }
  return new THREE.MeshBasicMaterial(opts);
}

function _part(THREE, parent, w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

// One speedboat mesh: white hull with a blue stripe, open cockpit with
// two seats, a raked windscreen, and a black outboard motor on the stern.
function _buildBoatMesh(THREE) {
  const g = new THREE.Group();
  const hullMat = _lambert(THREE, 0xf2f0e8);
  const stripeMat = _lambert(THREE, 0x1d6fa8);
  const deckMat = _lambert(THREE, 0x2e4a5a);
  const seatMat = _lambert(THREE, 0x8a2a2a);
  const glassMat = _lambert(THREE, 0x9fd4e8);
  const darkMat = _lambert(THREE, 0x1c1e24);
  const chromeMat = _lambert(THREE, 0xc8ccd2);

  // Hull: long box with a pointed bow made from a rotated wedge box.
  _part(THREE, g, 2.4, 0.9, 5.6, hullMat, 0, 0.45, 0);
  const bow = _part(THREE, g, 2.4, 0.9, 1.8, hullMat, 0, 0.45, 3.4);
  bow.rotation.y = Math.PI / 4;
  bow.scale.set(0.72, 1, 0.72);
  // Blue waterline stripe along both flanks.
  _part(THREE, g, 2.46, 0.22, 5.4, stripeMat, 0, 0.32, 0);
  // Deck + cockpit floor.
  _part(THREE, g, 2.1, 0.12, 4.6, deckMat, 0, 0.92, -0.3);
  // Bow deck cap and cleat.
  _part(THREE, g, 1.6, 0.1, 1.2, deckMat, 0, 0.94, 2.2);
  _part(THREE, g, 0.3, 0.12, 0.5, chromeMat, 0, 1.0, 2.2);
  // Windscreen: raked translucent panel ahead of the helm.
  const screen = _part(THREE, g, 1.9, 0.7, 0.1, glassMat, 0, 1.35, 1.1);
  screen.rotation.x = -0.35;
  // Helm console + wheel.
  _part(THREE, g, 1.0, 0.7, 0.5, darkMat, 0, 1.25, 0.7);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.05, 6, 16), darkMat);
  wheel.position.set(0, 1.55, 0.55);
  wheel.rotation.x = -0.5;
  g.add(wheel);
  // Two bucket seats.
  for (const sx of [-0.55, 0.55]) {
    _part(THREE, g, 0.7, 0.5, 0.6, seatMat, sx, 1.15, -0.4);
    _part(THREE, g, 0.7, 0.7, 0.18, seatMat, sx, 1.5, -0.75);
  }
  // Stern bench.
  _part(THREE, g, 1.9, 0.45, 0.5, seatMat, 0, 1.12, -1.9);
  // Outboard motor on the transom.
  _part(THREE, g, 0.6, 0.9, 0.45, darkMat, 0, 0.55, -3.0);
  _part(THREE, g, 0.5, 0.5, 0.3, stripeMat, 0, 1.1, -3.0);
  // Bow navigation lights: red port, green starboard.
  _part(THREE, g, 0.16, 0.12, 0.12, _basic(THREE, 0xff3020), -1.15, 1.0, 2.6);
  _part(THREE, g, 0.16, 0.12, 0.12, _basic(THREE, 0x20e060), 1.15, 1.0, 2.6);

  return g;
}

export class Boat {
  constructor(scene, THREE, opts) {
    this.scene = scene;
    this.THREE = THREE;
    const o = opts || {};
    this.player = o.player || null;
    this.game = o.game || null;
    this.particles = o.particles || (this.game && this.game.particles) || null;

    // --- state exposed to main.js / hud.js ---
    this.name = BOAT_NAME;
    this.active = false; // true while the player is aboard
    this.speed = 0; // signed m/s along the heading (forward positive)
    this.pos = new THREE.Vector3(DOCK.x, 0, DOCK.z);
    this.heading = 0; // 0 = facing +z, out to sea; forward = (sin h, cos h)
    this._t = 0;
    this._prevKeys = new Set();
    this._wakeAcc = 0;
    this._lastHint = '';

    // --- mooring: floating pontoon + posts beside the pier head ---
    const dock = new THREE.Group();
    const pontoonMat = _lambert(THREE, 0x6a4a2a);
    _part(THREE, dock, 5, 0.35, 2.6, pontoonMat, 0, 0.18, 0);
    _part(THREE, dock, 5, 0.08, 0.3, _lambert(THREE, 0xe8c832), 0, 0.4, 0);
    for (const px of [-2.2, 2.2]) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.18, 2.2, 8),
        _lambert(THREE, 0x5a4028),
      );
      post.position.set(px, 0.6, 0);
      dock.add(post);
    }
    dock.position.set(DOCK.x, 0, DOCK.z + 4.2);
    scene.add(dock);
    this.dock = dock;

    // --- the boat itself ---
    this.boat = _buildBoatMesh(THREE);
    this.boat.position.set(this.pos.x, 0, this.pos.z);
    this.boat.rotation.y = this.heading;
    // Minimap compat: hud reads .pos on tracked objects.
    this.boat.pos = this.pos;
    scene.add(this.boat);

    // --- HUD hint line (own DOM node, no hud.js edit needed) ---
    const hint = document.createElement('div');
    hint.id = 'hud-boat';
    hint.style.cssText = 'position:fixed;left:50%;bottom:17%;transform:translateX(-50%);'
      + 'background:rgba(0,0,0,0.55);color:#fff;font:13px monospace;padding:6px 12px;'
      + 'border-radius:4px;display:none;z-index:30;pointer-events:none;white-space:nowrap;';
    document.body.appendChild(hint);
    this.hintEl = hint;
  }

  _down(input, code) {
    if (!input) return false;
    if (typeof input.isDown === 'function') return !!input.isDown(code);
    if (typeof input.down === 'function') return !!input.down(code);
    if (input.keys && typeof input.keys.has === 'function') return input.keys.has(code);
    return false;
  }

  // Own edge detection: the main loop clears Input.pressed at end of
  // frame, so a later update() call cannot rely on wasPressed().
  _pressed(input, code) {
    const now = this._down(input, code);
    const was = this._prevKeys.has(code);
    if (now) this._prevKeys.add(code);
    else this._prevKeys.delete(code);
    return now && !was;
  }

  _toast(msg) {
    try {
      const g = this.game;
      if (g && typeof g.toast === 'function') g.toast(msg);
      else if (g && g.hud && typeof g.hud.toast === 'function') g.hud.toast(msg);
    } catch (e) {}
  }

  // Minimap + HUD read-out: { x, y, z, speed, active }.
  boatPos() {
    return {
      x: this.pos.x,
      y: this.pos.y,
      z: this.pos.z,
      speed: this.speed,
      active: this.active,
    };
  }

  // HUD panel read-out (coordinator: hud.js car panel, see header).
  hudInfo() {
    return {
      name: this.name,
      speed: this.speed,
      kmh: Math.round(Math.abs(this.speed) * 3.6),
      active: this.active,
    };
  }

  nearBoat() {
    const p = this.player;
    if (!p || !p.pos || this.active) return false;
    const dx = p.pos.x - this.pos.x;
    const dz = p.pos.z - this.pos.z;
    return Math.sqrt(dx * dx + dz * dz) < BOARD_DIST;
  }

  nearDock() {
    const dx = this.pos.x - DOCK.x;
    const dz = this.pos.z - DOCK.z;
    return Math.sqrt(dx * dx + dz * dz) < EXIT_DIST;
  }

  tryBoard(player) {
    const p = player || this.player;
    if (!p || this.active) return false;
    if (p.mode && p.mode !== 'foot') return false;
    if (!this.nearBoat()) return false;
    this.active = true;
    this.speed = 0;
    p.mode = 'boat';
    if (p.mesh) p.mesh.visible = false;
    p.pos.set(this.pos.x, this.pos.y, this.pos.z);
    if (typeof p.angle === 'number') p.angle = this.heading;
    this._toast('BAY RUNNER — W/S gas · A/D belok · E turun di dermaga');
    return true;
  }

  exit() {
    const p = this.player;
    if (!p || !this.active) return false;
    if (!this.nearDock()) {
      this._toast('Mendekat ke dermaga untuk turun!');
      return false;
    }
    this.active = false;
    this.speed = 0;
    // Step onto the pier deck (x -7..7, z 260..344): clamp the boat's
    // position onto the deck so the player never lands in the water.
    const outX = Math.max(-5, Math.min(5, this.pos.x));
    const outZ = Math.max(308, Math.min(340, this.pos.z));
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

  // Drop the player out (e.g. died at sea) and re-moor the boat at the
  // dock, so it can never be stranded out of boarding reach.
  forceExit() {
    const p = this.player;
    if (!p || !this.active) return;
    this.active = false;
    this.speed = 0;
    this.pos.set(DOCK.x, 0, DOCK.z);
    this.heading = 0;
    this.boat.position.set(this.pos.x, 0, this.pos.z);
    this.boat.rotation.y = this.heading;
    p.pos.set(0, 0, 336);
    p.mode = 'foot';
    if (p.mesh) {
      p.mesh.visible = true;
      p.mesh.position.set(0, 0, 336);
    }
  }

  // Keep the next position inside the water. Tries the full move, then
  // each axis on its own; if neither axis is wet, the boat stays put and
  // scrubs speed instead of beaching.
  _clampToWater(nx, nz) {
    const cx = Math.max(MIN_X, Math.min(MAX_X, nx));
    const cz = Math.max(MIN_Z, Math.min(MAX_Z, nz));
    if (isInWater(cx, cz)) return { x: cx, z: cz, ok: true };
    if (isInWater(cx, this.pos.z)) return { x: cx, z: this.pos.z, ok: false };
    if (isInWater(this.pos.x, cz)) return { x: this.pos.x, z: cz, ok: false };
    return { x: this.pos.x, z: this.pos.z, ok: false };
  }

  _updateSailing(dt, input) {
    const w = this._down(input, 'KeyW');
    const s = this._down(input, 'KeyS');
    const a = this._down(input, 'KeyA');
    const d = this._down(input, 'KeyD');

    // Rudder: bite grows with way on, so the boat barely turns adrift.
    const steer = (d ? 1 : 0) - (a ? 1 : 0);
    const bite = Math.min(1, Math.abs(this.speed) / 6 + 0.15);
    if (steer !== 0) this.heading += steer * TURN_RATE * bite * dt;

    // Throttle: W powers forward, S brakes then reverses, else drag.
    if (w) this.speed = Math.min(MAX_SPEED, this.speed + ACCEL * dt);
    else if (s) this.speed = Math.max(MAX_REVERSE, this.speed - REVERSE_ACCEL * dt);
    else if (this.speed > 0) this.speed = Math.max(0, this.speed - DRAG * dt);
    else if (this.speed < 0) this.speed = Math.min(0, this.speed + DRAG * dt);

    // Advance, clamped to the water.
    const nx = this.pos.x + Math.sin(this.heading) * this.speed * dt;
    const nz = this.pos.z + Math.cos(this.heading) * this.speed * dt;
    const next = this._clampToWater(nx, nz);
    this.pos.x = next.x;
    this.pos.z = next.z;
    if (!next.ok) this.speed *= 0.5;

    // Bob on the swell + heel into the turn, nose up under power.
    const bob = Math.sin(this._t * 1.3) * 0.07 + Math.sin(this._t * 2.1 + 1.7) * 0.04;
    this.pos.y = 0.12 + bob;
    const pitch = -0.05 * Math.min(1, Math.max(0, this.speed) / MAX_SPEED);
    const roll = -0.09 * steer * bite * Math.min(1, Math.abs(this.speed) / 12);
    this.boat.rotation.set(pitch, this.heading, roll);
    this.boat.position.set(this.pos.x, this.pos.y, this.pos.z);

    // Wake: white spray at the stern while under way.
    if (Math.abs(this.speed) > WAKE_SPEED && this.particles
      && typeof this.particles.burst === 'function') {
      this._wakeAcc += dt;
      if (this._wakeAcc >= 0.09) {
        this._wakeAcc = 0;
        const bx = this.pos.x - Math.sin(this.heading) * 3.0;
        const bz = this.pos.z - Math.cos(this.heading) * 3.0;
        this.particles.burst(
          { x: bx, y: 0.25, z: bz },
          { count: 3, colors: [0xffffff, 0xdff2ff], speed: 1.6, life: 0.7, size: 0.55 },
        );
      }
    } else {
      this._wakeAcc = 0;
    }

    // Player rides along: position, heading and speed track the boat.
    const p = this.player;
    if (p && p.pos) {
      p.pos.set(this.pos.x, this.pos.y, this.pos.z);
      if (typeof p.angle === 'number') p.angle = this.heading;
      if (typeof p.speed === 'number') p.speed = Math.abs(this.speed);
      if (p.mesh) p.mesh.visible = false;
    }
  }

  _updateHint() {
    let text = '';
    if (this.active) {
      const kmh = Math.round(Math.abs(this.speed) * 3.6);
      text = 'BAY RUNNER · ' + kmh + ' km/h — W/S gas · A/D belok · E turun di dermaga';
    } else if (this.nearBoat()) {
      text = 'Tekan [E] — Naik speedboat BAY RUNNER';
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
    if (c.game) this.game = c.game;
    if (c.particles) this.particles = c.particles;
    if (!this.particles && this.game) this.particles = this.game.particles || null;
    const game = this.game;
    const p = this.player;

    // Only play in the live game: menu / pause / wasted leave it moored.
    if (game && game.state && game.state !== 'playing') {
      this._updateHint();
      return;
    }
    // Died at sea: drop out and re-moor so respawn is clean.
    if (this.active && p && typeof p.health === 'number' && p.health <= 0) {
      this.forceExit();
    }

    // E: board on foot at the dock, step off when moored close to it.
    // Shops and dialogue own E when they are open, so the boat never
    // steals that press.
    let busy = false;
    try {
      if (game) {
        if (game.shops && game.shops.open) busy = true;
        if (game.dialogOpen || (game.hud && game.hud.dialogOpen)) busy = true;
        if (game.missions && game.missions.dialogOpen) busy = true;
      }
    } catch (e) {}
    if (!busy && this._pressed(input, 'KeyE')) {
      if (this.active) this.exit();
      else if (p && p.mode === 'foot') this.tryBoard();
    }

    if (this.active) {
      this._updateSailing(dt, input);
    } else {
      // Moored: gentle bob at the dock, engine off.
      this.speed = 0;
      this.pos.y = 0.12 + Math.sin(this._t * 1.3) * 0.07;
      this.boat.rotation.set(0, this.heading, 0);
      this.boat.position.set(this.pos.x, this.pos.y, this.pos.z);
    }

    this._updateHint();
  }
}
