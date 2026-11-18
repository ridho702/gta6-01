// Solmar Bay — combat (pistol + fists), tracers, muzzle flash, particles, pickups.
import { dist2d } from './util.js';

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.parts = [];
    this.geo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
  }
  burst(x, y, z, color, n, speed) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ color }));
      m.position.set(x, y, z);
      this.scene.add(m);
      this.parts.push({
        mesh: m, life: 0.5 + Math.random() * 0.4,
        vx: (Math.random() - 0.5) * speed, vy: Math.random() * speed * 0.8 + 1, vz: (Math.random() - 0.5) * speed,
      });
    }
  }
  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.scene.remove(p.mesh); this.parts.splice(i, 1); continue; }
      p.vy -= 9 * dt;
      p.mesh.position.x += p.vx * dt; p.mesh.position.y += p.vy * dt; p.mesh.position.z += p.vz * dt;
      p.mesh.rotation.x += dt * 5; p.mesh.rotation.y += dt * 4;
      p.mesh.scale.setScalar(Math.max(0.1, p.life));
    }
  }
}

export class Combat {
  constructor(game) {
    this.game = game;
    this.ammo = 24;
    this.cool = 0;
    this.tracer = null;
    this.tracerLife = 0;
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]);
    this.tracer = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0 }));
    game.scene.add(this.tracer);
  }
  // Hitscan shot from the camera through the crosshair.
  shoot() {
    const g = this.game;
    if (this.cool > 0 || this.ammo <= 0 || g.inCar) return;
    this.cool = 0.28; this.ammo--;
    g.sound.gunshot();
    g.shake(0.12);
    const origin = g.camera.position.clone();
    const dir = new THREE.Vector3();
    g.camera.getWorldDirection(dir);
    // Find the best target: enemies, foot cops, pedestrians, police cars.
    let best = null, bestD = 60;
    const targets = [];
    for (const e of g.enemies) if (e.alive) targets.push({ obj: e, r: 1.2, kind: 'enemy' });
    for (const c of g.wanted.footCops) if (c.alive) targets.push({ obj: c, r: 1.2, kind: 'cop' });
    for (const p of g.pedestrians) if (p.alive) targets.push({ obj: p, r: 1.0, kind: 'ped' });
    for (const c of g.wanted.policeCars) targets.push({ obj: c, r: 2.4, kind: 'policeCar' });
    for (const t of targets) {
      const to = new THREE.Vector3(t.obj.x - origin.x, 1.2 - origin.y, t.obj.z - origin.z);
      const d = to.length();
      if (d > 60 || d < 1) continue;
      const ang = to.normalize().angleTo(dir);
      if (ang < 0.12 + t.r / d && d < bestD) { best = t; bestD = d; }
    }
    const end = origin.clone().add(dir.clone().multiplyScalar(best ? bestD : 60));
    this.showTracer(origin, end);
    g.effects.burst(end.x, end.y, end.z, 0xffd23e, 6, 3);
    if (best) {
      if (best.kind === 'policeCar') { g.wanted.addHeat(6, 'Shots fired at police!'); }
      else {
        const died = best.obj.damage(34);
        g.effects.burst(best.obj.x, 1.3, best.obj.z, 0xd8382e, 8, 4);
        if (best.kind === 'enemy' && died) g.missions.onKill();
        if (best.kind === 'ped' && died) g.wanted.addHeat(12, 'Civilian down!');
        if (best.kind === 'cop') g.wanted.addHeat(18, 'Officer down!');
      }
    }
    if (this.ammo === 0) g.hud.setMessage('OUT OF AMMO — find a green $ pickup');
  }
  showTracer(a, b) {
    const pos = this.tracer.geometry.attributes.position;
    pos.setXYZ(0, a.x, a.y, a.z); pos.setXYZ(1, b.x, b.y, b.z);
    pos.needsUpdate = true;
    this.tracer.material.opacity = 0.9; this.tracerLife = 0.08;
  }
  punch() {
    const g = this.game;
    if (this.cool > 0 || g.inCar) return;
    this.cool = 0.4;
    g.sound.punch();
    const p = g.playerPos();
    const dir = g.playerHeading;
    for (const e of [...g.enemies, ...g.wanted.footCops, ...g.pedestrians]) {
      if (!e.alive) continue;
      const d = dist2d(p.x, p.z, e.x, e.z);
      const ang = Math.abs(Math.atan2(e.x - p.x, e.z - p.z) - dir);
      if (d < 2.4 && ang < 1.0) {
        const died = e.damage(25);
        g.effects.burst(e.x, 1.2, e.z, 0xffffff, 5, 3);
        if (e.enemy && died) g.missions.onKill();
        if (e.police) g.wanted.addHeat(10, 'Assault on an officer!');
        break;
      }
    }
  }
  update(dt) {
    this.cool = Math.max(0, this.cool - dt);
    if (this.tracerLife > 0) {
      this.tracerLife -= dt;
      if (this.tracerLife <= 0) this.tracer.material.opacity = 0;
    }
  }
}

// Cash / health / ammo pickups scattered around the city.
export class Pickups {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
  }
  spawn(x, z, kind) {
    const color = kind === 'health' ? 0xff5a5a : kind === 'ammo' ? 0x9fd8ff : 0x7dff9b;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9),
      new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.5 }));
    m.position.set(x, 1.1, z);
    m.rotation.y = Math.PI / 4;
    this.scene.add(m);
    this.items.push({ mesh: m, x, z, kind, t: Math.random() * 6 });
  }
  update(dt, game) {
    const p = game.playerPos();
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      it.mesh.rotation.y += dt * 2;
      it.mesh.position.y = 1.1 + Math.sin(it.t * 3) * 0.15;
      if (dist2d(p.x, p.z, it.x, it.z) < 2.2) {
        if (it.kind === 'cash') { game.cash += 150; game.showToast('+$150'); game.sound.cash(); }
        if (it.kind === 'health') { game.health = Math.min(100, game.health + 40); game.showToast('+40 HEALTH'); game.sound.pickup(); }
        if (it.kind === 'ammo') { game.combat.ammo += 24; game.showToast('+24 AMMO'); game.sound.pickup(); }
        this.scene.remove(it.mesh);
        this.items.splice(i, 1);
      }
    }
  }
}
