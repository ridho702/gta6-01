// Solmar Bay — pedestrians, foot police and mission enemies.
// People are simple articulated low-poly figures that walk the sidewalks,
// chat, flee from gunfire, and (as enemies) fight back in missions.
import { clamp, angleLerp, dist2d, mulberry32 } from './util.js';
import { STREETS, collideCircle } from './city.js';

const SHIRTS = [0xd84a4a, 0x4a7ad8, 0x4ad87a, 0xd8c84a, 0xd84ab0, 0x7a4ad8, 0xe8e8e8, 0x333333];
const SKINS = [0xe8b88a, 0xc98a5a, 0x8a5a38, 0xf0c8a0];

export function makePersonMesh(shirt, skin, police, enemy) {
  const g = new THREE.Group();
  const shirtMat = new THREE.MeshLambertMaterial({ color: police ? 0x1a2a4a : shirt });
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const pantsMat = new THREE.MeshLambertMaterial({ color: police ? 0x141c2e : 0x2e3a4a });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.9, 0.4), shirtMat);
  body.position.y = 1.05; g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skinMat);
  head.position.y = 1.75; g.add(head);
  if (police) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.14, 0.46),
      new THREE.MeshLambertMaterial({ color: 0x0e1a30 }));
    cap.position.y = 2.0; g.add(cap);
  } else if (enemy) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.12, 0.46),
      new THREE.MeshLambertMaterial({ color: 0xc0392b }));
    band.position.y = 1.95; g.add(band);
  }
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.7, 0.3), pantsMat);
  legL.position.set(-0.18, 0.35, 0); g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.18; g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.75, 0.22), shirtMat);
  armL.position.set(-0.48, 1.1, 0); g.add(armL);
  const armR = armL.clone(); armR.position.x = 0.48; g.add(armR);
  g.userData = { legL, legR, armL, armR, body };
  return g;
}

export class Person {
  constructor(scene, x, z, opts = {}) {
    const rnd = mulberry32((Math.random() * 1e9) | 0);
    this.scene = scene;
    this.police = !!opts.police; this.enemy = !!opts.enemy;
    this.mesh = makePersonMesh(
      SHIRTS[Math.floor(rnd() * SHIRTS.length)],
      SKINS[Math.floor(rnd() * SKINS.length)], this.police, this.enemy);
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    this.x = x; this.z = z;
    this.heading = rnd() * Math.PI * 2;
    this.speed = 0; this.walkPhase = rnd() * 6;
    this.health = this.enemy ? 60 : 100;
    this.state = opts.state || 'walk'; // walk | flee | chase | fight | dead
    this.target = null; // {x,z} waypoint
    this.waitT = rnd() * 2;
    this.alive = true;
    this.shootCd = 0;
    this.pickTarget();
  }
  pickTarget() {
    const s = STREETS[Math.floor(Math.random() * STREETS.length)];
    const along = (Math.random() * 2 - 1) * 280;
    if (Math.random() < 0.5) this.target = { x: along, z: s + 10 };
    else this.target = { x: s + 10, z: along };
  }
  update(dt, colliders, player, fleeFrom) {
    if (!this.alive) return;
    this.shootCd -= dt;
    let speed = 0;
    if (this.state === 'dead') return;
    if (fleeFrom) {
      const d = dist2d(this.x, this.z, fleeFrom.x, fleeFrom.z);
      if (d < 30) {
        this.state = 'flee';
        const a = Math.atan2(this.x - fleeFrom.x, this.z - fleeFrom.z);
        this.heading = angleLerp(this.heading, a, Math.min(1, dt * 6));
        speed = 5.5;
      } else if (this.state === 'flee') { this.state = 'walk'; this.pickTarget(); }
    }
    if (this.state === 'chase' && player) {
      const d = dist2d(this.x, this.z, player.x, player.z);
      this.heading = angleLerp(this.heading, Math.atan2(player.x - this.x, player.z - this.z), Math.min(1, dt * 5));
      speed = d > 2 ? 4.6 : 0;
    } else if (this.state === 'fight' && player) {
      const d = dist2d(this.x, this.z, player.x, player.z);
      this.heading = angleLerp(this.heading, Math.atan2(player.x - this.x, player.z - this.z), Math.min(1, dt * 5));
      speed = d > 12 ? 4 : 0;
    } else if (this.state === 'walk' || this.state === 'flee') {
      if (this.state === 'walk') {
        if (!this.target) this.pickTarget();
        const d = dist2d(this.x, this.z, this.target.x, this.target.z);
        if (d < 3) {
          this.waitT -= dt; speed = 0;
          if (this.waitT <= 0) { this.pickTarget(); this.waitT = 1 + Math.random() * 3; }
        } else {
          this.heading = angleLerp(this.heading, Math.atan2(this.target.x - this.x, this.target.z - this.z), Math.min(1, dt * 3));
          speed = 1.6 + Math.random() * 0.4;
        }
      }
    }
    this.speed = speed;
    if (speed > 0.1) {
      const nx = this.x + Math.sin(this.heading) * speed * dt;
      const nz = this.z + Math.cos(this.heading) * speed * dt;
      const c = collideCircle(colliders, nx, nz, 0.6);
      this.x = c.x; this.z = c.z;
      this.walkPhase += dt * speed * 2.2;
    }
    const m = this.mesh;
    m.position.set(this.x, 0, this.z);
    m.rotation.y = this.heading;
    const sw = Math.sin(this.walkPhase) * (speed > 0.1 ? 0.55 : 0);
    m.userData.legL.rotation.x = sw; m.userData.legR.rotation.x = -sw;
    m.userData.armL.rotation.x = -sw * 0.7; m.userData.armR.rotation.x = sw * 0.7;
    if (this.state === 'fight' || this.state === 'chase') {
      m.userData.armR.rotation.x = -1.4; // aiming
    }
  }
  damage(amount) {
    this.health -= amount;
    if (this.health <= 0 && this.alive) {
      this.alive = false; this.state = 'dead';
      this.mesh.rotation.z = Math.PI / 2; this.mesh.position.y = 0.3;
    }
    return !this.alive;
  }
  dispose() { this.scene.remove(this.mesh); }
}
