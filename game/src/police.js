// Solmar Bay — wanted level and Bay Police response.
import { Car, CAR_MODELS } from './vehicles.js';
import { Person } from './people.js';
import { dist2d } from './util.js';

export class WantedSystem {
  constructor(game) {
    this.game = game;
    this.stars = 0;
    this.heat = 0;          // 0..100, drives star changes
    this.decayT = 0;
    this.policeCars = [];
    this.footCops = [];
    this.spawnT = 0;
    this.bustT = 0;
    this.sirenOn = false;
  }
  addHeat(amount, reason) {
    this.heat = Math.min(100, this.heat + amount);
    const want = this.heat >= 85 ? 5 : this.heat >= 65 ? 4 : this.heat >= 45 ? 3 : this.heat >= 25 ? 2 : this.heat >= 8 ? 1 : 0;
    if (want > this.stars) {
      this.stars = want;
      this.game.showToast('★'.repeat(want) + ' WANTED');
      this.game.hud.setWanted(want);
      if (reason) this.game.say([['DISPATCH', reason + ' — Bay Police responding.']]);
    }
    this.decayT = 0;
  }
  clear() {
    this.stars = 0; this.heat = 0; this.bustT = 0;
    this.game.hud.setWanted(0);
    for (const c of this.policeCars) c.dispose(this.game.scene);
    for (const p of this.footCops) p.dispose();
    this.policeCars = []; this.footCops = [];
  }
  update(dt) {
    const g = this.game;
    const p = g.playerPos();
    // Heat decays only when no police can see the player.
    const anyNear = this.policeCars.some(c => dist2d(c.x, c.z, p.x, p.z) < 60) ||
      this.footCops.some(c => dist2d(c.x, c.z, p.x, p.z) < 25);
    if (!anyNear && this.stars > 0) {
      this.decayT += dt;
      if (this.decayT > 4) { this.heat = Math.max(0, this.heat - dt * 6); }
    } else this.decayT = 0;
    const want = this.heat >= 85 ? 5 : this.heat >= 65 ? 4 : this.heat >= 45 ? 3 : this.heat >= 25 ? 2 : this.heat >= 8 ? 1 : 0;
    if (want !== this.stars) {
      this.stars = want; g.hud.setWanted(want);
      if (want === 0) g.showToast('YOU LOST THE POLICE');
    }
    // Spawn / despawn police to match stars.
    const wantCars = this.stars === 0 ? 0 : Math.min(1 + this.stars, 5);
    this.spawnT -= dt;
    if (this.policeCars.length < wantCars && this.spawnT <= 0) {
      this.spawnT = 1.2;
      const a = Math.random() * Math.PI * 2;
      const x = p.x + Math.sin(a) * 70, z = p.z + Math.cos(a) * 70;
      const car = new Car(g.scene, CAR_MODELS[1], x, z, Math.atan2(p.x - x, p.z - z), true);
      car.police = true; car.chase = true;
      g.scene.add(car.mesh);
      this.policeCars.push(car);
      g.sound.setSiren(true);
    }
    if (this.stars === 0 && this.policeCars.length === 0) g.sound.setSiren(false);
    // Foot cops when the player is on foot and wanted.
    if (!g.inCar && this.stars > 0 && this.footCops.length < Math.min(this.stars, 3) && Math.random() < dt * 0.5) {
      const a = Math.random() * Math.PI * 2;
      const cop = new Person(g.scene, p.x + Math.sin(a) * 30, p.z + Math.cos(a) * 30, { police: true, state: 'chase' });
      this.footCops.push(cop);
    }
    // Police cars chase and ram.
    for (const car of this.policeCars) {
      const d = dist2d(car.x, car.z, p.x, p.z);
      const targetHeading = Math.atan2(p.x - car.x, p.z - car.z);
      const steer = Math.max(-1, Math.min(1, (targetHeading - car.heading + Math.PI * 3) % (Math.PI * 2) - Math.PI));
      const speed = g.inCar ? 26 + this.stars * 1.5 : 14;
      car.drive(dt, { throttle: d > 6 ? 1 : 0.2, steer: steer * 0.9, brake: d < 4 }, g.colliders);
      // ram the player's car, then back off so the cars do not weld together
      if (g.inCar && d < 4.5) {
        g.playerCar.speed *= 0.92;
        if (Math.abs(g.playerCar.speed) > 10) g.sound.crash();
        g.shake(0.25);
      }
      if (d < 3.8) {
        const push = 3.8 - d;
        const ax = (car.x - p.x) / (d || 1), az = (car.z - p.z) / (d || 1);
        car.x += ax * push; car.z += az * push;
        car.mesh.position.set(car.x, 0, car.z);
      }
      // flash the light bar
      const t = performance.now() / 180;
      if (car.mesh.userData.lightRed) {
        car.mesh.userData.lightRed.material.color.setHex(Math.sin(t) > 0 ? 0xff2020 : 0x550000);
        car.mesh.userData.lightBlue.material.color.setHex(Math.sin(t) > 0 ? 0x111144 : 0x2040ff);
      }
    }
    // Foot cops chase; touching a slow player starts a bust.
    let busting = false;
    for (const cop of this.footCops) {
      cop.update(dt, g.colliders, p, null);
      const d = dist2d(cop.x, cop.z, p.x, p.z);
      if (!g.inCar && d < 2.2) busting = true;
      if (d > 120) { cop.dispose(); this.footCops.splice(this.footCops.indexOf(cop), 1); }
    }
    if (busting) {
      this.bustT += dt;
      g.hud.setMessage(`BUSTED IN ${Math.ceil(3 - this.bustT)}… RUN!`);
      if (this.bustT > 3) { this.bustT = 0; g.busted(); }
    } else { this.bustT = 0; if (g.hud.messageEl.textContent.startsWith('BUSTED')) g.hud.setMessage(''); }
    // Clean up far police cars when heat is gone.
    this.policeCars = this.policeCars.filter(c => {
      if (this.stars === 0 && dist2d(c.x, c.z, p.x, p.z) > 150) { c.dispose(g.scene); return false; }
      return true;
    });
  }
}
