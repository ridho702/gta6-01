// airunit.js — police helicopter + roadblocks (Sprint 1 visual polish).
// Same behaviour as before, much more visible on screen:
//   - helicopter orbits LOWER (height ~28) and CLOSER (radius ~22),
//     slower, so it stays in frame;
//   - periodic low "flyover" sweep (about every 25 s the heli dips to
//     ~14 and sweeps fast across the player's view, then climbs back);
//   - brighter spotlight cone (opacity ~0.22) and a bigger/brighter
//     ground light pool (radius ~9, opacity ~0.35);
//   - rotor blur disc, blinking red/green nav lights, spotlight lens kept.
//   - holdAngle: when set to an angle, update() freezes the heli at that
//     orbit angle (used by the autopilot to keep it in frame for shots).
// Roadblocks behave exactly as before, plus a small blinking red/blue
// beacon pair on the roof of every roadblock car.

export class AirUnit {
  constructor(scene, THREE) {
    this.scene = scene;
    this.THREE = THREE;
    this.active = false;
    this.angle = 0;
    this.height = 28;
    this.radius = 22;
    this.holdAngle = null;
    this._t = 0;
    this._mode = 'orbit';
    this._modeT = 0;

    const g = new THREE.Group();
    this.group = g;
    const dark = new THREE.MeshLambertMaterial({ color: 0x1c2733 });
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x2e4a66 });
    const bladeMat = new THREE.MeshLambertMaterial({ color: 0x111111 });

    // Fuselage.
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.6, 4.6), bodyMat);
    g.add(body);
    // Cockpit glass (nose, +z).
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 1.0, 1.4),
      new THREE.MeshBasicMaterial({ color: 0x9fd8ff })
    );
    glass.position.set(0, 0.25, 1.9);
    g.add(glass);
    // Police stripe.
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(2.65, 0.35, 4.0),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    stripe.position.set(0, -0.1, 0.2);
    g.add(stripe);
    // Tail boom + fin.
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.45, 5.2, 8), dark);
    boom.rotation.x = Math.PI / 2;
    boom.position.set(0, 0.35, -4.4);
    g.add(boom);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.6, 1.1), dark);
    fin.position.set(0, 1.0, -6.8);
    g.add(fin);
    // Landing skids.
    const skidL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 3.6), dark);
    skidL.position.set(-1.1, -1.15, 0.3);
    g.add(skidL);
    const skidR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 3.6), dark);
    skidR.position.set(1.1, -1.15, 0.3);
    g.add(skidR);

    // Mast + main rotor (two crossed blades = 4-blade look).
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.9, 8), dark);
    mast.position.y = 1.2;
    g.add(mast);
    const rotor = new THREE.Group();
    rotor.position.y = 1.7;
    const blade1 = new THREE.Mesh(new THREE.BoxGeometry(11, 0.08, 0.5), bladeMat);
    rotor.add(blade1);
    const blade2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 11), bladeMat);
    rotor.add(blade2);
    g.add(rotor);
    this.rotor = rotor;
    // Rotor blur disc (transparent dark disc above the rotor).
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(5.5, 24),
      new THREE.MeshBasicMaterial({
        color: 0x000000, transparent: true, opacity: 0.16, side: THREE.DoubleSide,
      })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 1.68;
    g.add(disc);
    this.disc = disc;

    // Tail rotor (spins around its x axle).
    const tailRotor = new THREE.Group();
    tailRotor.position.set(0.35, 0.9, -6.8);
    const tailBlade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.2, 0.3), bladeMat);
    tailRotor.add(tailBlade);
    g.add(tailRotor);
    this.tailRotor = tailRotor;

    // Spotlight cone: apex at the heli, widening down to the ground.
    // Geometry is 28 tall (apex +14, base -14); it is scaled/positioned
    // in update() to match the current height.
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(8, 28, 20, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xfff2b0, transparent: true, opacity: 0.22,
        side: THREE.DoubleSide, depthWrite: false,
      })
    );
    cone.position.y = -14;
    g.add(cone);
    this.cone = cone;

    // Spotlight lens (bright disc under the nose, kept from before).
    const lens = new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    lens.rotation.x = Math.PI / 2; // face down
    lens.position.set(0, -0.85, 1.6);
    g.add(lens);
    this.lens = lens;

    // Navigation lights: red (port) / green (starboard), blinking.
    const navRed = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xff2222 })
    );
    navRed.position.set(-1.45, 0, 0.5);
    g.add(navRed);
    this.navRed = navRed;
    const navGreen = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x22ff66 })
    );
    navGreen.position.set(1.45, 0, 0.5);
    g.add(navGreen);
    this.navGreen = navGreen;
    // White tail strobe, blinking opposite phase.
    const strobe = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    strobe.position.set(0, 1.6, -6.9);
    g.add(strobe);
    this.strobe = strobe;

    // Ground light pool (scene child: stays on the ground under the
    // player while the heli itself flies at height).
    const pool = new THREE.Mesh(
      new THREE.CircleGeometry(9, 24),
      new THREE.MeshBasicMaterial({
        color: 0xffe9a0, transparent: true, opacity: 0.35,
        side: THREE.DoubleSide, depthWrite: false,
      })
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.06;
    scene.add(pool);
    this.pool = pool;

    g.visible = false;
    pool.visible = false;
    scene.add(g);
  }

  update(dt, playerPos, wanted, t) {
    const time = typeof t === 'number' ? t : (this._t += dt);
    if (typeof t === 'number') this._t = t;
    const px = playerPos && typeof playerPos.x === 'number' ? playerPos.x : 0;
    const pz = playerPos && typeof playerPos.z === 'number' ? playerPos.z : 0;
    const want = typeof wanted === 'number' ? wanted : 0;

    if (want < 3) {
      if (this.active) {
        this.active = false;
        this.group.visible = false;
        this.pool.visible = false;
      }
      this._mode = 'orbit';
      this._modeT = 0;
      return;
    }
    this.active = true;
    this.group.visible = true;
    this.pool.visible = true;

    // Orbit / flyover state machine. Frozen entirely while holdAngle set.
    let height = this.height;
    let radius = this.radius;
    if (this.holdAngle === null || this.holdAngle === undefined) {
      this._modeT += dt;
      if (this._mode === 'orbit') {
        this.angle += dt * 0.22; // slow orbit, stays in frame
        if (this._modeT >= 25) {
          this._mode = 'flyover';
          this._modeT = 0;
        }
      } else {
        // Flyover: fast low sweep across the player's view (~4.6 s),
        // dipping to ~14 and climbing back to orbit height.
        this.angle += dt * 0.9;
        const dip = Math.min(1, this._modeT / 1.2);
        const climb = Math.max(0, (this._modeT - 3.4) / 1.2);
        height = 28 - 14 * dip + 14 * climb;
        radius = 22 - 4 * dip + 4 * climb;
        if (this._modeT >= 4.6) {
          this._mode = 'orbit';
          this._modeT = 0;
        }
      }
    } else {
      this.angle = this.holdAngle;
      this._mode = 'orbit';
      this._modeT = 0;
    }

    const x = px + Math.sin(this.angle) * radius;
    const z = pz + Math.cos(this.angle) * radius;
    this.group.position.set(x, height, z);
    // Nose points along the direction of travel (orbit tangent).
    this.group.rotation.y = this.angle + Math.PI / 2;

    // Spin the rotors.
    if (this.rotor) this.rotor.rotation.y += dt * 22;
    if (this.tailRotor) this.tailRotor.rotation.x += dt * 30;

    // Spotlight cone follows the current height (apex stays at the heli,
    // base stays on the ground).
    if (this.cone) {
      this.cone.scale.y = height / 28;
      this.cone.position.y = -height / 2;
    }
    // Ground pool follows the player.
    if (this.pool) this.pool.position.set(px, 0.06, pz);

    // Nav lights blink with time; strobe blinks opposite phase.
    const blink = Math.sin(time * 5) > 0;
    if (this.navRed) this.navRed.visible = blink;
    if (this.navGreen) this.navGreen.visible = blink;
    if (this.strobe) this.strobe.visible = !blink;
  }
}

export class Roadblocks {
  constructor(scene, THREE, makePoliceCar) {
    this.scene = scene;
    this.THREE = THREE;
    this.makePoliceCar = makePoliceCar;
    this.blocks = [];
    this._timer = 0;
    this._t = 0;
  }

  clear() {
    for (let i = 0; i < this.blocks.length; i++) this._removeBlock(this.blocks[i]);
    this.blocks = [];
    this._timer = 0;
  }

  _removeBlock(block) {
    for (let i = 0; i < block.cars.length; i++) {
      const obj = block.cars[i].obj;
      if (!obj) continue;
      if (obj.parent) obj.parent.remove(obj);
      else if (this.scene) this.scene.remove(obj);
    }
  }

  _spawnBlock(playerPos, heading) {
    const px = playerPos && typeof playerPos.x === 'number' ? playerPos.x : 0;
    const pz = playerPos && typeof playerPos.z === 'number' ? playerPos.z : 0;
    const head = typeof heading === 'number' ? heading : 0;
    // ~70 m ahead of the player.
    const ax = px + Math.sin(head) * 70;
    const az = pz + Math.cos(head) * 70;
    // Snap to the nearest road line.
    let bestX = 0;
    let bestZ = 0;
    let bdX = Infinity;
    let bdZ = Infinity;
    for (let i = 0; i <= 10; i++) {
      const line = -260 + i * 52;
      const dx = Math.abs(ax - line);
      if (dx < bdX) { bdX = dx; bestX = line; }
      const dz = Math.abs(az - line);
      if (dz < bdZ) { bdZ = dz; bestZ = line; }
    }
    let cx;
    let cz;
    let carAngle;
    let alongX; // offset direction of the two cars (along the road)
    if (bdX <= bdZ) {
      cx = bestX; cz = az; carAngle = Math.PI / 2; alongX = false;
    } else {
      cx = ax; cz = bestZ; carAngle = 0; alongX = true;
    }
    const block = { x: cx, z: cz, angle: carAngle, life: 14, cars: [] };
    const offsets = [-4.5, 4.5];
    for (let i = 0; i < offsets.length; i++) {
      let carObj = null;
      try {
        carObj = this.makePoliceCar ? this.makePoliceCar() : null;
      } catch (e) { carObj = null; }
      if (!carObj) {
        try { carObj = this.makePoliceCar(cx, cz, carAngle); } catch (e) { carObj = null; }
      }
      if (!carObj) continue;
      const obj = carObj.group || carObj.mesh || carObj;
      const carX = cx + (alongX ? offsets[i] : 0);
      const carZ = cz + (alongX ? 0 : offsets[i]);
      if (obj.position && typeof obj.position.set === 'function') {
        obj.position.set(carX, 0, carZ);
      } else if (obj.position) {
        obj.position.x = carX;
        obj.position.z = carZ;
      }
      if (obj.rotation) obj.rotation.y = carAngle;
      try { if (carObj && typeof carObj.angle === 'number') carObj.angle = carAngle; } catch (e) {}
      if (!obj.parent && this.scene) this.scene.add(obj);
      // Blinking red/blue beacon pair on the roof.
      const beaconR = new this.THREE.Mesh(
        new this.THREE.BoxGeometry(0.34, 0.16, 0.3),
        new this.THREE.MeshBasicMaterial({ color: 0xff2222 })
      );
      beaconR.position.set(-0.32, 1.55, 0);
      obj.add(beaconR);
      const beaconB = new this.THREE.Mesh(
        new this.THREE.BoxGeometry(0.34, 0.16, 0.3),
        new this.THREE.MeshBasicMaterial({ color: 0x2266ff })
      );
      beaconB.position.set(0.32, 1.55, 0);
      obj.add(beaconB);
      block.cars.push({ obj: obj, mesh: obj, x: carX, z: carZ, beaconR: beaconR, beaconB: beaconB });
    }
    if (block.cars.length) this.blocks.push(block);
    return block;
  }

  // Distance to the nearest block ahead of the player (within range),
  // or 0 when there is none.
  ahead(playerPos, heading, range) {
    if (!playerPos || !this.blocks.length) return 0;
    const px = playerPos.x || 0;
    const pz = playerPos.z || 0;
    const r = typeof range === 'number' ? range : 120;
    const head = typeof heading === 'number' ? heading : 0;
    const fx = Math.sin(head);
    const fz = Math.cos(head);
    let best = 0;
    for (let i = 0; i < this.blocks.length; i++) {
      const b = this.blocks[i];
      const dx = b.x - px;
      const dz = b.z - pz;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > r) continue;
      if (d > 0.001 && dx * fx + dz * fz < 0) continue; // behind the player
      if (best === 0 || d < best) best = d;
    }
    return best;
  }

  update(dt, wanted, playerPos, heading) {
    this._t += dt;
    const w = typeof wanted === 'number'
      ? wanted
      : (wanted && (wanted.wanted !== undefined ? wanted.wanted : wanted.stars)) || 0;
    // Expire old blocks (14 s lifetime).
    for (let i = this.blocks.length - 1; i >= 0; i--) {
      const b = this.blocks[i];
      b.life -= dt;
      if (b.life <= 0) {
        this._removeBlock(b);
        this.blocks.splice(i, 1);
      }
    }
    // Blink the beacons: red and blue alternate.
    const phase = Math.floor(this._t * 2.5) % 2 === 0;
    for (let i = 0; i < this.blocks.length; i++) {
      const cars = this.blocks[i].cars;
      for (let j = 0; j < cars.length; j++) {
        if (cars[j].beaconR) cars[j].beaconR.visible = phase;
        if (cars[j].beaconB) cars[j].beaconB.visible = !phase;
      }
    }
    // At wanted >= 4, keep up to 2 blocks, (re)spawning on a 14 s timer.
    if (w >= 4 && playerPos) {
      this._timer -= dt;
      if (this.blocks.length < 2 && this._timer <= 0) {
        this._spawnBlock(playerPos, heading);
        this._timer = 14;
      }
    }
  }

  // Push a car position out of any roadblock car it overlaps.
  // Returns true when a collision happened.
  resolve(carPos, radius) {
    if (!carPos || !this.blocks.length) return false;
    const r = typeof radius === 'number' ? radius : 2;
    let hit = false;
    for (let i = 0; i < this.blocks.length; i++) {
      const cars = this.blocks[i].cars;
      for (let j = 0; j < cars.length; j++) {
        const c = cars[j];
        const dx = carPos.x - c.x;
        const dz = carPos.z - c.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        const min = r + 2.0;
        if (d < min && d > 0.0001) {
          const push = (min - d) / d;
          carPos.x += dx * push;
          carPos.z += dz * push;
          hit = true;
        } else if (d <= 0.0001) {
          carPos.x += min;
          hit = true;
        }
      }
    }
    return hit;
  }
}
