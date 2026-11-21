// Solmar Bay — the police air unit and roadblocks. SBPD Air-1 is a
// helicopter that orbits the player once the heat hits three stars, with
// spinning rotors and a spotlight cone tracking the player on the ground.
// At four stars the SBPD also throws roadblocks across the road ahead of
// the player. Both are pure scene dressing plus a little pressure: the
// heli itself does no damage, the roadblock cars are solid obstacles.

import { clamp, dist2 } from './util.js';
import { HALF } from './city.js';

export class AirUnit {
  constructor(scene, THREE) {
    this.scene = scene;
    this.THREE = THREE;
    this.active = false;
    this.angle = 0;
    this.height = 46;
    this.radius = 34;
    this._build();
    this.group.visible = false;
  }

  _build() {
    const T = this.THREE;
    const g = new T.Group();
    const navy = new T.MeshLambertMaterial({ color: 0x1a2a4a });
    const white = new T.MeshLambertMaterial({ color: 0xe8e8e8 });
    const dark = new T.MeshLambertMaterial({ color: 0x14151a });
    const glass = new T.MeshLambertMaterial({ color: 0x9fc4d8 });

    const body = new T.Mesh(new T.BoxGeometry(3.4, 2.0, 5.6), navy);
    body.position.y = 0;
    g.add(body);
    const nose = new T.Mesh(new T.BoxGeometry(2.6, 1.5, 1.6), glass);
    nose.position.set(0, -0.2, 3.2);
    g.add(nose);
    const stripe = new T.Mesh(new T.BoxGeometry(3.45, 0.5, 5.65), white);
    stripe.position.y = 0.4;
    g.add(stripe);
    const tail = new T.Mesh(new T.BoxGeometry(0.9, 0.9, 5.2), navy);
    tail.position.set(0, 0.3, -5.0);
    g.add(tail);
    const fin = new T.Mesh(new T.BoxGeometry(0.3, 2.2, 1.6), white);
    fin.position.set(0, 1.2, -7.2);
    g.add(fin);
    // Skids.
    for (const sx of [-1.3, 1.3]) {
      const skid = new T.Mesh(new T.BoxGeometry(0.18, 0.18, 5.0), dark);
      skid.position.set(sx, -1.5, 0.4);
      g.add(skid);
    }
    // Main rotor (spins) + mast.
    const mast = new T.Mesh(new T.CylinderGeometry(0.25, 0.25, 1.2, 8), dark);
    mast.position.y = 1.5;
    g.add(mast);
    this.rotor = new T.Group();
    const bladeGeo = new T.BoxGeometry(11, 0.12, 0.7);
    const bladeMat = new T.MeshLambertMaterial({ color: 0x22242a });
    for (let i = 0; i < 2; i++) {
      const blade = new T.Mesh(bladeGeo, bladeMat);
      blade.rotation.y = (i * Math.PI) / 2;
      this.rotor.add(blade);
    }
    this.rotor.position.y = 2.1;
    g.add(this.rotor);
    // Tail rotor.
    this.tailRotor = new T.Mesh(new T.BoxGeometry(0.12, 2.4, 0.5), bladeMat);
    this.tailRotor.position.set(0.6, 1.4, -7.2);
    g.add(this.tailRotor);
    // Searchlight: a cone of light aimed at the ground + a bright lens.
    const coneGeo = new T.ConeGeometry(7, 42, 20, 1, true);
    const coneMat = new T.MeshBasicMaterial({
      color: 0xfff2b0, transparent: true, opacity: 0.10,
      side: T.DoubleSide, depthWrite: false,
    });
    this.cone = new T.Mesh(coneGeo, coneMat);
    this.cone.position.y = -22;
    g.add(this.cone);
    const lens = new T.Mesh(
      new T.SphereGeometry(0.5, 10, 8),
      new T.MeshBasicMaterial({ color: 0xfff8d0 }),
    );
    lens.position.set(0, -1.1, 2.6);
    g.add(lens);
    // The pool of light on the ground.
    const poolGeo = new T.CircleGeometry(7, 24);
    const poolMat = new T.MeshBasicMaterial({
      color: 0xfff2b0, transparent: true, opacity: 0.22, depthWrite: false,
    });
    this.pool = new T.Mesh(poolGeo, poolMat);
    this.pool.rotation.x = -Math.PI / 2;
    this.pool.position.y = 0.12;
    this.scene.add(this.pool);
    this.pool.visible = false;

    this.group = g;
    this.scene.add(g);
  }

  update(dt, playerPos, wanted, t) {
    const want = wanted >= 3;
    if (want && !this.active) {
      this.active = true;
      this.group.visible = true;
      this.pool.visible = true;
    } else if (!want && this.active) {
      this.active = false;
      this.group.visible = false;
      this.pool.visible = false;
    }
    if (!this.active) return;
    this.angle += dt * 0.35;
    const x = playerPos.x + Math.sin(this.angle) * this.radius;
    const z = playerPos.z + Math.cos(this.angle) * this.radius;
    const y = this.height + Math.sin(t * 0.7) * 2;
    this.group.position.set(x, y, z);
    // Face the player, bank slightly into the turn.
    this.group.rotation.y = Math.atan2(playerPos.x - x, playerPos.z - z);
    this.group.rotation.z = 0.12;
    this.rotor.rotation.y += dt * 22;
    this.tailRotor.rotation.x += dt * 30;
    // The cone hangs from the heli, tilted slightly toward the player;
    // the pool of light on the ground sells the tracking effect.
    const dx = playerPos.x - x;
    const dz = playerPos.z - z;
    this.cone.position.set(dx * 0.12, -22, dz * 0.12);
    this.cone.rotation.z = -dx * 0.004;
    this.cone.rotation.x = dz * 0.004;
  }
}

// Roadblocks: two SBPD cruisers parked across the road ahead of the
// player, with a warning when one is close ahead. Managed by Police in
// main.js via setRoadblocks(wanted, playerPos, heading).
export class Roadblocks {
  constructor(scene, THREE, makePoliceCar) {
    this.scene = scene;
    this.THREE = THREE;
    this.makePoliceCar = makePoliceCar;
    this.blocks = []; // { cars: [{mesh, pos}], pos, angle }
    this._timer = 0;
  }

  clear() {
    for (const b of this.blocks) {
      for (const c of b.cars) this.scene.remove(c.mesh.group);
    }
    this.blocks = [];
  }

  // True when a roadblock sits within `range` ahead of the player.
  ahead(playerPos, heading, range) {
    for (const b of this.blocks) {
      const dx = b.pos.x - playerPos.x;
      const dz = b.pos.z - playerPos.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < range) {
        const fx = Math.sin(heading);
        const fz = Math.cos(heading);
        if ((dx * fx + dz * fz) / Math.max(0.01, d) > 0.4) return Math.round(d);
      }
    }
    return 0;
  }

  update(dt, wanted, playerPos, heading) {
    this._timer -= dt;
    if (wanted < 4) {
      if (this.blocks.length > 0) this.clear();
      return;
    }
    if (this._timer > 0 || this.blocks.length >= 2) return;
    this._timer = 14;
    // Place across the road ~70m ahead of the player, snapped to the
    // nearest street line so the cruisers sit on asphalt.
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    let bx = playerPos.x + fx * 70;
    let bz = playerPos.z + fz * 70;
    bx = clamp(bx, -HALF + 12, HALF - 12);
    bz = clamp(bz, -HALF + 12, HALF - 12);
    // Snap to the nearest street (streets every 52m, offset -260).
    const snap = (v) => Math.round((v + 260) / 52) * 52 - 260;
    if (Math.abs(fx) > Math.abs(fz)) bz = snap(bz);
    else bx = snap(bx);
    const blockAngle = Math.atan2(fx, fz) + Math.PI / 2;
    const cars = [];
    for (const off of [-4.5, 4.5]) {
      const built = this.makePoliceCar();
      const cx = bx + Math.cos(blockAngle) * off;
      const cz = bz + Math.sin(blockAngle) * off;
      built.group.position.set(cx, 0, cz);
      built.group.rotation.y = blockAngle;
      this.scene.add(built.group);
      cars.push({ mesh: built, pos: { x: cx, z: cz } });
    }
    this.blocks.push({ cars, pos: { x: bx, z: bz }, angle: blockAngle });
    if (this.blocks.length > 2) {
      const old = this.blocks.shift();
      for (const c of old.cars) this.scene.remove(c.mesh.group);
    }
  }

  // Roadblock cars are solid: push the player's car out of them.
  resolve(carPos, radius) {
    for (const b of this.blocks) {
      for (const c of b.cars) {
        const d = dist2(carPos.x, carPos.z, c.pos.x, c.pos.z);
        if (d < 3.4 + radius && d > 0.01) {
          const push = (3.4 + radius - d);
          carPos.x += ((carPos.x - c.pos.x) / d) * push;
          carPos.z += ((carPos.z - c.pos.z) / d) * push;
          return true;
        }
      }
    }
    return false;
  }
}
