// Solmar Bay — entry point: renderer, camera, game loop, state machine,
// car enter/exit, enemy fire, day clock, save/load, menus and autopilot hook.
import { buildCity, LANDMARKS, collideCircle } from './city.js';
import { Car, CAR_MODELS, spawnTrafficCar } from './vehicles.js';
import { Person } from './people.js';
import { Player } from './player.js';
import { MissionManager } from './missions.js';
import { WantedSystem } from './police.js';
import { Combat, Effects, Pickups } from './combat.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { SoundEngine } from './audio.js';
import { Autopilot } from './autopilot.js';
import { saveGameData, loadGameData, clearSaveData, hasSave } from './save.js';
import { mulberry32, clamp, dist2d } from './util.js';

window.addEventListener('error', (e) => {
  const el = document.getElementById('errlog');
  if (el) el.textContent += 'ERR:' + e.message + ' @' + (e.filename || '') + ':' + (e.lineno || '') + ';';
});

class Game {
  constructor() {
    this.canvas = document.getElementById('scene');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = false;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
    this.camera.position.set(0, 12, -18);

    this.sound = new SoundEngine();
    this.hud = new HUD();
    this.input = new Input(this.canvas);
    this.effects = new Effects(this.scene);
    this.combat = new Combat(this);
    this.pickups = new Pickups(this.scene);
    this.missions = new MissionManager(this);
    this.wanted = new WantedSystem(this);
    this.autopilot = new Autopilot(this);

    const city = buildCity(this.scene);
    this.colliders = city.colliders;
    this.rnd = mulberry32(4242);

    this.cash = 250; this.health = 100;
    this.clockH = 9; this.clockM = 12;
    this.state = 'title'; // title | playing | paused | over
    this.inCar = false;
    this.playerCar = null;
    this.missionCar = null;
    this.parked = [];
    this.traffic = [];
    this.pedestrians = [];
    this.enemies = [];
    this.dialogueQueue = [];
    this.dialogueT = 0;
    this.camYaw = 0; this.camPitch = 0.42; this.camDist = 11;
    this.shakeT = 0;
    this.time = 0;
    this.lastT = performance.now();
    this.fleePoint = null;

    this.player = new Player(this.scene, 12, 12);
    this.spawnWorld();
    this.makeBeacon();
    this.wireMenus();
    window.addEventListener('resize', () => this.onResize());
    this.input.onKey = (code) => this.onKey(code);
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
    // Debug / demo entry points (?demo=1, ?shot=1..4, ?selftest=1).
    const params = new URLSearchParams(location.search);
    this.autopilot.configure(params);
    if (params.get('selftest') === '1') {
      this.startGame(true);
      setTimeout(() => {
        document.title = 'SELFTEST ' + (document.getElementById('errlog').textContent ? 'ERRORS:' + document.getElementById('errlog').textContent : 'OK') +
          ' cash=' + this.cash + ' mission=' + this.missions.index + ' traffic=' + this.traffic.length;
      }, 4000);
    }
  }

  spawnWorld() {
    // Parked cars along the streets (stealable).
    for (let i = 0; i < 12; i++) {
      const horizontal = this.rnd() < 0.5;
      const street = [-270, -210, -150, -90, -30, 30, 90, 150, 210, 270][Math.floor(this.rnd() * 10)];
      const along = (this.rnd() * 2 - 1) * 260;
      const model = CAR_MODELS[Math.floor(this.rnd() * CAR_MODELS.length)];
      const car = new Car(this.scene, model,
        horizontal ? along : street + 9, horizontal ? street + 9 : along,
        horizontal ? Math.PI / 2 : 0, false);
      this.parked.push(car);
    }
    // The gold Comet Coupe for mission 2, parked by Palms Mall.
    this.missionCar = new Car(this.scene, CAR_MODELS[0], LANDMARKS.mall.x + 14, LANDMARKS.mall.z + 12, Math.PI / 2, false);
    this.missionCar.mesh.children[0].material = new THREE.MeshLambertMaterial({ color: 0xf2c200 });
    this.parked.push(this.missionCar);
    // Traffic.
    for (let i = 0; i < 14; i++) this.traffic.push(spawnTrafficCar(this.scene, this.colliders, this.rnd));
    // Pedestrians.
    for (let i = 0; i < 26; i++) {
      const s = [-270, -210, -150, -90, -30, 30, 90, 150, 210, 270][Math.floor(this.rnd() * 10)];
      const along = (this.rnd() * 2 - 1) * 280;
      this.pedestrians.push(new Person(this.scene,
        this.rnd() < 0.5 ? along : s + 10, this.rnd() < 0.5 ? s + 10 : along, {}));
    }
    // Pickups: cash, health, ammo around the city.
    const spots = [[-30, -90, 'cash'], [90, 90, 'health'], [-150, 30, 'ammo'], [210, -30, 'cash'],
      [30, 210, 'health'], [-90, -210, 'ammo'], [150, 150, 'cash'], [-210, 90, 'health']];
    for (const [x, z, k] of spots) this.pickups.spawn(x, z, k);
  }

  makeBeacon() {
    this.beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(3, 3, 80, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
    this.scene.add(this.beacon);
    this.beaconTop = new THREE.Mesh(new THREE.ConeGeometry(2.4, 4, 4),
      new THREE.MeshBasicMaterial({ color: 0xffd23e }));
    this.scene.add(this.beaconTop);
  }

  wireMenus() {
    const $ = (id) => document.getElementById(id);
    $('playBtn').onclick = () => { this.sound.init(); this.startGame(false); };
    $('continueBtn').onclick = () => { this.sound.init(); this.startGame(true); };
    $('howBtn').onclick = () => $('howPanel').classList.toggle('hidden');
    $('muteBtn').onclick = (e) => {
      this.sound.init();
      this.sound.setMuted(!this.sound.muted);
      e.target.textContent = this.sound.muted ? 'SOUND: OFF' : 'SOUND: ON';
    };
    $('resumeBtn').onclick = () => this.togglePause(false);
    $('saveBtn').onclick = () => {
      this.saveGame();
      $('saveNote').textContent = 'Saved — progress kept in this browser.';
    };
    $('restartBtn').onclick = () => {
      clearSaveData(); location.reload();
    };
    $('quitBtn').onclick = () => location.reload();
    $('endBtn').onclick = () => {
      $('endScreen').classList.add('hidden');
      this.respawn();
    };
    if (hasSave()) $('continueBtn').classList.remove('hidden');
  }

  startGame(fromSave) {
    document.getElementById('startScreen').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    this.state = 'playing';
    if (fromSave) {
      const s = loadGameData();
      if (s) {
        this.cash = s.cash ?? 250; this.health = s.health ?? 100;
        this.player.x = s.x ?? 12; this.player.z = s.z ?? 12;
        this.combat.ammo = s.ammo ?? 24;
        this.missions.start(s.mission ?? 0);
        this.hud.setCash(this.cash); this.hud.setHealth(this.health);
        this.showToast('SAVE LOADED');
        return;
      }
    }
    this.missions.start(0);
    this.hud.setCash(this.cash); this.hud.setHealth(this.health);
    this.hud.setObjective(this.missions.stageDef.label, this.missions.mission.title);
  }

  saveGame() {
    saveGameData({
      cash: this.cash, health: this.health, ammo: this.combat.ammo,
      mission: this.missions.done ? 0 : this.missions.index,
      x: this.player.x, z: this.player.z, time: Date.now(),
    });
  }

  playerPos() {
    if (this.inCar && this.playerCar) return { x: this.playerCar.x, z: this.playerCar.z };
    return { x: this.player.x, z: this.player.z };
  }
  get playerHeading() { return this.inCar && this.playerCar ? this.playerCar.heading : this.player.heading; }

  showToast(t) { this.hud.showToast(t); }
  say(lines) { this.dialogueQueue.push(...lines); }
  sayLines(lines) { this.dialogueQueue.push(...lines); }
  shake(a) { this.shakeT = Math.max(this.shakeT, a); }

  onKey(code) {
    if (this.state !== 'playing') return;
    if (code === 'KeyP' || code === 'Escape') { this.togglePause(); return; }
    if (code === 'KeyM') { this.sound.setMuted(!this.sound.muted); return; }
    if (code === 'KeyC') { this.camDist = this.camDist > 12 ? 9 : 15; return; }
    if (code === 'KeyE') {
      if (this.inCar) this.exitCar();
      else this.enterNearestCar(false);
      return;
    }
    if (code === 'KeyH' && this.inCar) this.sound.horn();
    if (code === 'KeyF' && !this.inCar) this.combat.punch();
  }

  togglePause(force) {
    const toPause = force !== undefined ? force : this.state === 'playing';
    if (toPause && this.state === 'playing') {
      this.state = 'paused';
      document.getElementById('pauseMenu').classList.remove('hidden');
      document.getElementById('pauseStats').innerHTML =
        `Cash $${this.cash.toLocaleString('en-US')} · Health ${Math.ceil(this.health)} · Ammo ${this.combat.ammo}<br>` +
        `Mission ${Math.min(this.missions.index + 1, 6)} / 6 — ${this.missions.mission ? this.missions.mission.title : 'Story complete'}<br>` +
        `Wanted ★${this.wanted.stars} · Cars stolen: ${this.carsStolen || 0}`;
    } else if (!toPause && this.state === 'paused') {
      this.state = 'playing';
      document.getElementById('pauseMenu').classList.add('hidden');
    }
  }

  enterNearestCar(auto) {
    let best = null, bestD = auto ? 60 : 5;
    const p = this.playerPos();
    for (const c of [...this.parked, ...this.traffic]) {
      if (!c.alive) continue;
      const d = dist2d(p.x, p.z, c.x, c.z);
      if (d < bestD) { best = c; bestD = d; }
    }
    if (!best) {
      if (auto) {
        // Autopilot fallback: walk to the nearest parked car first.
        let nb = null, nd = 1e9;
        for (const c of this.parked) {
          const d = dist2d(p.x, p.z, c.x, c.z);
          if (d < nd) { nd = d; nb = c; }
        }
        if (nb) { this.player.x = nb.x + 3; this.player.z = nb.z; best = nb; }
      }
      if (!best) { if (!auto) this.hud.setHint('No car nearby — walk to a parked car and press E'); return; }
    }
    this.playerCar = best;
    this.inCar = true;
    this.player.onFoot = false;
    this.player.setVisible(false);
    best.isPlayerCar = true;
    // Stealing a traffic car is a crime; a parked car is "borrowing" — still hot.
    if (this.traffic.includes(best)) {
      this.traffic.splice(this.traffic.indexOf(best), 1);
      best.ai = null;
      this.carsStolen = (this.carsStolen || 0) + 1;
      this.wanted.addHeat(10, 'Car stolen!');
      this.showToast('CAR STOLEN — ★ WANTED');
    } else {
      this.carsStolen = (this.carsStolen || 0) + 1;
      this.wanted.addHeat(6, '');
    }
    if (best === this.missionCar) {
      best.stolen = true;
      this.showToast('GOLD COUPE SECURED');
    }
    this.hud.setHint('W/S drive · A/D steer · Space handbrake · E exit · H horn');
    this.sound.setEngine(0, true);
  }

  exitCar() {
    if (!this.playerCar) return;
    const car = this.playerCar;
    this.player.x = car.x + Math.cos(car.heading) * 3;
    this.player.z = car.z - Math.sin(car.heading) * 3;
    const c = collideCircle(this.colliders, this.player.x, this.player.z, 0.7);
    this.player.x = c.x; this.player.z = c.z;
    this.player.heading = car.heading;
    this.player.onFoot = true;
    this.player.setVisible(true);
    this.inCar = false; this.playerCar = null;
    car.isPlayerCar = false;
    this.sound.setEngine(0, false);
    this.hud.setHint('E enter car · LMB shoot · F punch');
  }

  spawnMissionEnemies(target, count) {
    for (let i = 0; i < count; i++) {
      const e = new Person(this.scene,
        target.x + (this.rnd() - 0.5) * 24, target.z + (this.rnd() - 0.5) * 24,
        { enemy: true, state: 'fight' });
      this.enemies.push(e);
    }
    this.showToast('THE VULTURES ARE HERE');
  }

  damagePlayer(amount) {
    if (this.state !== 'playing') return;
    this.health -= amount;
    this.hud.setHealth(this.health);
    this.shake(0.3);
    if (this.health <= 0) this.wasted();
  }

  wasted() {
    this.state = 'over';
    this.cash = Math.max(0, this.cash - 100);
    document.getElementById('endTitle').textContent = 'WASTED';
    document.getElementById('endText').textContent = 'Dana was taken down. The hospital patched you up — for $100. The city is still waiting.';
    document.getElementById('endScreen').classList.remove('hidden');
    this.sound.setSiren(false);
  }
  busted() {
    this.state = 'over';
    this.cash = Math.max(0, this.cash - 150);
    document.getElementById('endTitle').textContent = 'BUSTED';
    document.getElementById('endText').textContent = 'The Bay Police caught Dana. Bail cost $150. Marlow is not happy.';
    document.getElementById('endScreen').classList.remove('hidden');
    this.sound.setSiren(false);
  }
  respawn() {
    this.health = 100;
    this.hud.setHealth(100); this.hud.setCash(this.cash);
    this.player.x = LANDMARKS.hospital.x + 12; this.player.z = LANDMARKS.hospital.z + 12;
    if (this.inCar) { this.playerCar = null; this.inCar = false; this.player.onFoot = true; this.player.setVisible(true); }
    this.wanted.clear();
    this.state = 'playing';
    this.showToast('BACK ON THE STREETS');
  }
  storyComplete() {
    this.showToast('★ STORY COMPLETE — SOLMAR BAY IS YOURS ★');
    this.say([['MARLOW', 'Every job done, every debt paid. Solmar Bay is yours now, Dana. Free roam — the city never sleeps.']]);
    this.hud.setObjective('Free roam — explore Solmar Bay, steal cars, outrun the police.', 'STORY COMPLETE');
    this.saveGame();
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  update(dt) {
    this.time += dt;
    // Day clock: 1 game hour per 50 seconds.
    this.clockM += dt * 1.2;
    if (this.clockM >= 60) { this.clockM = 0; this.clockH = (this.clockH + 1) % 24; }
    this.hud.setClock(this.clockH, this.clockM);

    // Camera orbit (drag) + zoom.
    this.camYaw -= this.input.mouseDX * 0.005;
    this.camPitch = clamp(this.camPitch + this.input.mouseDY * 0.003, 0.12, 1.1);
    this.camDist = clamp(this.camDist + this.input.wheel * 0.01, 7, 18);

    // Dialogue queue.
    this.dialogueT -= dt;
    if (this.dialogueQueue.length && this.dialogueT <= 0) {
      const [sp, tx] = this.dialogueQueue.shift();
      this.hud.showDialogue(sp, tx);
      this.dialogueT = 4.5;
    } else if (!this.dialogueQueue.length && this.dialogueT <= 0) {
      this.hud.hideDialogue();
    }

    if (this.state !== 'playing') { this.input.endFrame(); return; }

    this.autopilot.update(dt);

    // Player / car control.
    if (this.inCar && this.playerCar) {
      const throttle = this.input.axis('KeyS', 'KeyW');
      const steer = this.input.axis('KeyA', 'KeyD');
      if (!this.autopilot.enabled) {
        this.playerCar.drive(dt, {
          throttle, steer,
          brake: this.input.keys['Space'],
        }, this.colliders);
        this.sound.setEngine(Math.abs(this.playerCar.speed) / this.playerCar.model.top, true);
      }
      // Bump traffic: slow both and push the traffic car aside.
      for (const t of this.traffic) {
        const td = dist2d(t.x, t.z, this.playerCar.x, this.playerCar.z);
        if (td < 4) {
          t.speed *= 0.6; this.playerCar.speed *= 0.85;
          const push = 4 - td;
          const ax = (t.x - this.playerCar.x) / (td || 1), az = (t.z - this.playerCar.z) / (td || 1);
          t.x += ax * push; t.z += az * push;
          t.mesh.position.set(t.x, 0, t.z);
          if (Math.abs(this.playerCar.speed) > 12) { this.sound.crash(); this.shake(0.2); }
        }
      }
      this.hud.setSpeed(this.playerCar.speed * 2.2, this.playerCar.model.name, true);
      this.hud.setCrosshair(false);
    } else {
      this.player.update(dt, this.input, this.colliders, this.camYaw);
      this.sound.setEngine(0, false);
      this.hud.setSpeed(0, '', false);
      this.hud.setCrosshair(true);
      if (this.input.clicked) { this.combat.shoot(); this.fleePoint = this.playerPos(); }
    }
    this.combat.update(dt);

    // Traffic + pedestrians.
    const pp = this.playerPos();
    for (const t of this.traffic) t.updateAI(dt, this.colliders, pp);
    // Keep traffic topped up.
    if (this.traffic.length < 12 && Math.random() < dt * 0.3) {
      this.traffic.push(spawnTrafficCar(this.scene, this.colliders, this.rnd));
    }
    for (let i = this.traffic.length - 1; i >= 0; i--) {
      if (dist2d(this.traffic[i].x, this.traffic[i].z, pp.x, pp.z) > 260) {
        this.traffic[i].dispose(this.scene);
        this.traffic.splice(i, 1);
      }
    }
    for (const ped of this.pedestrians) ped.update(dt, this.colliders, pp, this.fleePoint);
    this.fleePoint = null;

    // Enemies fight back.
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e.alive) { e.dispose(); this.enemies.splice(i, 1); continue; }
      e.update(dt, this.colliders, pp, null);
      const d = dist2d(e.x, e.z, pp.x, pp.z);
      if (d < 42 && e.shootCd <= 0) {
        e.shootCd = 1.4 + Math.random();
        if (Math.random() < 0.4) {
          this.damagePlayer(7 + Math.random() * 5);
          this.effects.burst(pp.x, 1.4, pp.z, 0xffd23e, 4, 3);
        }
        this.sound.blip(180, 0.08, 'sawtooth', 0.06);
      }
    }
    // Foot cops shoot when far, chase when near (handled in WantedSystem).
    this.wanted.update(dt);
    this.pickups.update(dt, this);
    this.missions.update(dt, this);
    this.effects.update(dt);

    // Mission beacon + objective distance.
    const target = this.missions.currentTarget();
    if (target && this.missions.active) {
      this.beacon.visible = true; this.beaconTop.visible = true;
      this.beacon.position.set(target.x, 30, target.z);
      this.beaconTop.position.set(target.x, 62 + Math.sin(this.time * 2) * 1.5, target.z);
      this.beaconTop.rotation.y += dt;
      const d = Math.hypot(pp.x - target.x, pp.z - target.z);
      this.hud.setObjectiveDist(`${Math.round(d)}m — follow the yellow beam`);
    } else {
      this.beacon.visible = false; this.beaconTop.visible = false;
      this.hud.setObjectiveDist('');
    }

    // Nearest-car hint on foot.
    if (!this.inCar) {
      let bestD = 99;
      for (const c of [...this.parked, ...this.traffic]) bestD = Math.min(bestD, dist2d(pp.x, pp.z, c.x, c.z));
      if (bestD < 5) this.hud.setHint('Press E to get in the car');
    }

    // Camera follow.
    const focus = this.inCar && this.playerCar
      ? { x: this.playerCar.x, z: this.playerCar.z, y: 1.5, h: this.playerCar.heading }
      : { x: this.player.x, z: this.player.z, y: 1.6, h: this.player.heading };
    const camH = this.inCar ? this.playerCar.heading : this.camYaw;
    const tx = focus.x - Math.sin(camH) * Math.cos(this.camPitch) * this.camDist;
    const tz = focus.z - Math.cos(camH) * Math.cos(this.camPitch) * this.camDist;
    const ty = focus.y + Math.sin(this.camPitch) * this.camDist + 1.2;
    const k = Math.min(1, dt * 6);
    this.camera.position.x += (tx - this.camera.position.x) * k;
    this.camera.position.y += (ty - this.camera.position.y) * k;
    this.camera.position.z += (tz - this.camera.position.z) * k;
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      this.camera.position.x += (Math.random() - 0.5) * this.shakeT;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeT;
    }
    const lookX = focus.x + Math.sin(camH) * 6;
    const lookZ = focus.z + Math.cos(camH) * 6;
    this.camera.lookAt(lookX, focus.y, lookZ);

    this.hud.setCash(this.cash);
    this.hud.drawMinimap(this);
    this.input.endFrame();
  }

  loop(now) {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, (now - this.lastT) / 1000 || 0.016);
    this.lastT = now;
    if (this.state !== 'paused') this.update(dt);
    this.renderer.render(this.scene, this.camera);
  }
}

window.__game = new Game();
