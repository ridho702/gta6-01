// main.js — Solmar Bay (GTA-style open world, make.fun gta6-01).
// Plain ES module on top of the global THREE (window.THREE), no bundler,
// no network resources. Sprint 1: PCFSoft shadows that follow the player
// + pooled particle effects (muzzle flash, punch dust, death explosions,
// smoking-car smoke).

import { RNG, clamp, lerpAngle } from './util.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { buildCity } from './city.js';
import { Traffic } from './vehicles.js';
import { Pedestrians } from './people.js';
import { Player } from './player.js';
import { Police } from './police.js';
import { Combat } from './combat.js';
import { Missions } from './missions.js';
import { HUD } from './hud.js';
import { loadSave, saveGame, clearSave } from './save.js';
import { applyAutopilot } from './autopilot.js';
import { Progress, STATIONS, WEAPONS } from './progress.js';
import { AirUnit, Roadblocks } from './airunit.js';
import { Shops } from './shops.js';
import { Particles } from './particles.js';
import { dressCity } from './citydress.js';

const THREE = window.THREE;

window.__errors = [];
window.addEventListener('error', (e) => {
  window.__errors.push(e.message || String(e.error || e));
});
window.addEventListener('unhandledrejection', (e) => {
  window.__errors.push('unhandled: ' + (e.reason && e.reason.message ? e.reason.message : String(e.reason)));
});

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8a5a8a);
scene.fog = new THREE.Fog(0xc07850, 200, 700);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1600);

const hemi = new THREE.HemisphereLight(0xd8a0c8, 0x5a4a3a, 0.85);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffb060, 1.6);
sun.position.set(-220, 55, 140);
sun.castShadow = true;
sun.shadow.camera.left = -90;
sun.shadow.camera.right = 90;
sun.shadow.camera.top = 90;
sun.shadow.camera.bottom = -90;
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 500;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0005;
scene.add(sun);
scene.add(sun.target);

const fill = new THREE.DirectionalLight(0x8a7aff, 0.35);
fill.position.set(120, 80, -160);
scene.add(fill);

const particles = new Particles(scene, THREE);

// ---------------------------------------------------------------- systems
const rng = new RNG(2026);
const city = buildCity(THREE);
dressCity(THREE, city);
scene.add(city.group);

const input = new Input();
input.attach();

const audio = new AudioEngine();
const hud = new HUD();
const traffic = new Traffic(scene, THREE, 777);
const peds = new Pedestrians(scene, THREE, 888);
const player = new Player(scene, THREE, { x: 150, z: -130 });
const police = new Police(scene, THREE, 999);
const combat = new Combat(scene, THREE, city.colliders);
const progress = new Progress();
const airUnit = new AirUnit(scene, THREE);
const roadblocks = new Roadblocks(scene, THREE, () => police._makePoliceCarMesh());

// HUD compat: the minimap reads the heli position as airUnit.pos, but the
// AirUnit instance only exposes it as group.position, so alias it.
if (airUnit.group && airUnit.group.position) airUnit.pos = airUnit.group.position;

const game = {
  THREE: THREE,
  scene: scene,
  camera: camera,
  renderer: renderer,
  city: city,
  traffic: traffic,
  peds: peds,
  player: player,
  police: police,
  combat: combat,
  hud: hud,
  audio: audio,
  input: input,
  progress: progress,
  airUnit: airUnit,
  roadblocks: roadblocks,
  particles: particles,
  clockMinutes: 1127, // 18:47 golden hour
  camYaw: 0.6,
  camPitch: 0.3,
  camDist: 7.5,
  camFar: false,
  state: 'menu',
  demoOrbit: false,
  muted: false,
  _fireCd: 0,
  saveNow: saveNow,
  onStoryComplete: onStoryComplete,
  startGame: startGame,
  respawn: respawn,
  togglePause: togglePause,
  toast: toast,
};

const missions = new Missions(game);
game.missions = missions;
player.progress = progress;
const shops = new Shops(game);
game.shops = shops;
audio.setStation(STATIONS[0]);

// Soft shadows for everything built so far. Ground / water / light pools
// (PlaneGeometry / CircleGeometry) and transparent materials never cast.
scene.traverse((o) => {
  if (!o.isMesh) return;
  o.receiveShadow = true;
  const m = o.material;
  const transparent = !!(m && (m.transparent || (m.opacity !== undefined && m.opacity < 1)));
  const g = o.geometry;
  const flat = !!(g && (g.type === 'PlaneGeometry' || g.type === 'CircleGeometry'));
  if (!transparent && !flat) o.castShadow = true;
});

// ---------------------------------------------------------------- helpers
function toast(msg) {
  if (!msg) return;
  if (hud && typeof hud.toast === 'function') hud.toast(msg);
  else if (typeof game !== 'undefined' && game && typeof game.toast === 'function' && game.toast !== toast) game.toast(msg);
}

function getPos(obj) {
  if (!obj) return null;
  if (obj.pos) return obj.pos;
  if (obj.position) return obj.position;
  if (obj.mesh && obj.mesh.position) return obj.mesh.position;
  if (obj.group && obj.group.position) return obj.group.position;
  return null;
}

function playerPos() {
  return getPos(player) || { x: 150, y: 0, z: -130 };
}

function playerAngle() {
  if (player.angle !== undefined) return player.angle;
  if (player.heading !== undefined) return player.heading;
  if (player.yaw !== undefined) return player.yaw;
  if (player.facing !== undefined) return player.facing;
  return 0;
}

function setPlayerAngle(a) {
  if ('angle' in player) player.angle = a;
  else if ('heading' in player) player.heading = a;
  else if ('yaw' in player) player.yaw = a;
  else player.angle = a;
}

function setPlayerPos(x, z) {
  const p = getPos(player);
  if (p && typeof p.set === 'function') p.set(x, p.y || 0, z);
  else if (p) { p.x = x; p.z = z; }
  else if (typeof player.setPosition === 'function') player.setPosition(x, z);
}

function playerHealth() {
  if (typeof player.health === 'number') return player.health;
  if (typeof progress.health === 'number') return progress.health;
  return 100;
}

function setPlayerHealth(v) {
  player.health = v;
  if (progress && 'health' in progress) progress.health = v;
}

function getCar() {
  return player.car || player.vehicle || player.currentCar || null;
}

function isDriving() {
  return !!(player.mode === 'drive' || player.mode === 'car'
    || player.inCar || player.driving || player.isDriving || getCar());
}

function carPos(car) {
  return getPos(car) || playerPos();
}

function carAngle(car) {
  if (!car) return 0;
  if (car.angle !== undefined) return car.angle;
  if (car.heading !== undefined) return car.heading;
  if (car.yaw !== undefined) return car.yaw;
  return 0;
}

function carSpeedVal(car) {
  if (typeof player.carSpeed === 'number') return player.carSpeed;
  if (car && typeof car.speed === 'number') return car.speed;
  if (typeof player.speed === 'number' && isDriving()) return player.speed;
  return 0;
}

function exitCar() {
  if (typeof player.exitCar === 'function') player.exitCar();
  else if (typeof player.getOut === 'function') player.getOut();
  else {
    player.car = null;
    player.vehicle = null;
    player.inCar = false;
    player.driving = false;
  }
}

function enterCar(car) {
  if (typeof player.enterCar === 'function') player.enterCar(car);
  else if (typeof player.getIn === 'function') player.getIn(car);
  else if (typeof player.enterVehicle === 'function') player.enterVehicle(car);
  else {
    player.car = car;
    player.inCar = true;
  }
}

function nearestParkedCar() {
  const pp = playerPos();
  let car = null;
  if (traffic && typeof traffic.nearestParked === 'function') {
    try { car = traffic.nearestParked(pp); } catch (e) { car = null; }
    if (!car) {
      try { car = traffic.nearestParked(pp.x, pp.z); } catch (e) { car = null; }
    }
  }
  if (typeof car === 'number') car = (traffic.cars && traffic.cars[car]) || null;
  if (car && car.car) car = car.car;
  if (!car) return null;
  const cp = carPos(car);
  if (!cp) return null;
  const dx = pp.x - cp.x;
  const dz = pp.z - cp.z;
  if (dx * dx + dz * dz > 4.5 * 4.5) return null;
  return car;
}

function getWeaponDef(name) {
  if (!name) return null;
  if (Array.isArray(WEAPONS)) {
    for (const w of WEAPONS) {
      if (w && (w.id === name || w.name === name)) return w;
    }
    return null;
  }
  if (WEAPONS && typeof WEAPONS === 'object') return WEAPONS[name] || null;
  return null;
}

function currentWeaponDef() {
  let w = null;
  if (progress && typeof progress.currentWeapon === 'function') {
    try { w = progress.currentWeapon(); } catch (e) { w = null; }
  }
  if (!w) w = getWeaponDef(progress.weapon || 'fists');
  return w;
}

function currentWeaponId() {
  const w = currentWeaponDef();
  if (w && (w.id || w.name)) return w.id || w.name;
  return progress.weapon || 'fists';
}

function getAmmo() {
  if (!progress) return 0;
  if (progress.ammo && typeof progress.ammo === 'object') {
    const v = progress.ammo[currentWeaponId()];
    return typeof v === 'number' ? v : 0;
  }
  return typeof progress.ammo === 'number' ? progress.ammo : 0;
}

function setAmmo(n) {
  if (!progress) return;
  if (progress.ammo && typeof progress.ammo === 'object') {
    progress.ammo[currentWeaponId()] = n;
  } else if (typeof progress.addAmmo === 'function') {
    // addAmmo takes a delta; adjust by the difference.
    progress.addAmmo(n - getAmmo());
  } else {
    progress.ammo = n;
  }
}

function addCash(n) {
  // Cash lives on the player, not on progress.
  player.cash = (typeof player.cash === 'number' ? player.cash : 0) + n;
}

// ------------------------------------------------------------ input helpers
// The Input class exposes pressed()/down() in the usual build; fall back to
// edge-detecting the held-key set so the game still works if only one of
// those surfaces exists.
const KEY_CODES = ['KeyP', 'KeyM', 'KeyC', 'KeyH', 'KeyR', 'KeyZ', 'KeyE', 'KeyF',
  'Digit1', 'Digit2', 'Digit3', 'Digit4'];
let _prevKeys = new Set();
let _curKeys = new Set();
let _prevMouse = false;

function keyDown(code) {
  if (typeof input.down === 'function') return !!input.down(code);
  if (typeof input.isDown === 'function') return !!input.isDown(code);
  if (input.keys instanceof Set) return input.keys.has(code);
  if (input.keys && typeof input.keys === 'object') return !!input.keys[code];
  return _curKeys.has(code);
}

function keyPressed(code) {
  if (typeof input.pressed === 'function') return !!input.pressed(code);
  if (typeof input.wasPressed === 'function') return !!input.wasPressed(code);
  if (typeof input.justPressed === 'function') return !!input.justPressed(code);
  return keyDown(code) && !_prevKeys.has(code);
}

function mouseHeld(btn) {
  if (typeof input.mouseDown === 'function') return !!input.mouseDown(btn || 0);
  if (typeof input.isMouseDown === 'function') return !!input.isMouseDown(btn || 0);
  if (input.mouseDown instanceof Set) return input.mouseDown.has(btn || 0);
  if (input.mouse instanceof Set) return input.mouse.has(btn || 0);
  if (Array.isArray(input.mouseButtons)) return !!input.mouseButtons[btn || 0];
  if (Array.isArray(input.mouse)) return !!input.mouse[btn || 0];
  if (typeof input.mouseDown === 'boolean') return input.mouseDown;
  if (typeof input.mouseHeld === 'boolean') return input.mouseHeld;
  return false;
}

function mouseClicked(btn) {
  if (typeof input.clicked === 'function') return !!input.clicked(btn || 0);
  if (typeof input.mousePressed === 'function') return !!input.mousePressed(btn || 0);
  if (typeof input.mouseClicked === 'function') return !!input.mouseClicked(btn || 0);
  if (typeof input.mousePressed === 'boolean') return input.mousePressed;
  const h = mouseHeld(btn || 0);
  return h && !_prevMouse;
}

// ---------------------------------------------------------------- pickups
const pickups = [];

function addPickup(kind, x, z, opts) {
  opts = opts || {};
  const colors = { health: 0x30c040, ammo: 0xe8c832, cash: 0xffd21f };
  const color = colors[kind] !== undefined ? colors[kind] : 0xffffff;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.9, 0.9),
    new THREE.MeshStandardMaterial({ color: color, emissive: color, emissiveIntensity: 0.35 })
  );
  mesh.rotation.y = Math.PI / 4;
  mesh.position.set(x, 1, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  const p = {
    kind: kind,
    mesh: mesh,
    x: x,
    z: z,
    phase: Math.random() * Math.PI * 2,
    respawn: opts.respawn !== undefined ? opts.respawn : 45,
    timer: 0,
    active: true,
    gone: false,
    amount: opts.amount || 0,
  };
  pickups.push(p);
  return p;
}

// 8 static pickups: 4 health, 4 ammo.
addPickup('health', 170, -140);
addPickup('health', -200, -200);
addPickup('health', 230, 10);
addPickup('health', -150, 110);
addPickup('ammo', 180, -150);
addPickup('ammo', -100, 50);
addPickup('ammo', 240, -50);
addPickup('ammo', -230, 150);

function collectPickup(p) {
  const wid = currentWeaponId();
  if (p.kind === 'health') {
    setPlayerHealth(Math.min(100, playerHealth() + 40));
    if (audio && typeof audio.pickup === 'function') audio.pickup();
  } else if (p.kind === 'ammo') {
    if (wid !== 'fists') {
      if (progress.ammo && typeof progress.ammo === 'object') {
        progress.ammo[wid] = (typeof progress.ammo[wid] === 'number' ? progress.ammo[wid] : 0) + 24;
      } else if (typeof progress.addAmmo === 'function') {
        progress.addAmmo(24);
      } else {
        progress.ammo = (typeof progress.ammo === 'number' ? progress.ammo : 0) + 24;
      }
      if (audio && typeof audio.pickup === 'function') audio.pickup();
    }
  } else if (p.kind === 'cash') {
    const amount = p.amount || (50 + Math.floor(Math.random() * 61));
    addCash(amount);
    if (audio && typeof audio.cash === 'function') audio.cash();
    toast('+$' + amount);
  }
  p.active = false;
  p.mesh.visible = false;
  if (p.respawn > 0) {
    p.timer = p.respawn;
  } else {
    p.gone = true;
    scene.remove(p.mesh);
  }
}

function updatePickups(dt, t) {
  const pp = playerPos();
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    if (p.gone) {
      pickups.splice(i, 1);
      continue;
    }
    if (!p.active) {
      p.timer -= dt;
      if (p.timer <= 0) {
        p.active = true;
        p.mesh.visible = true;
      }
      continue;
    }
    p.mesh.position.y = 1 + Math.sin(t * 2 + p.phase) * 0.25;
    p.mesh.rotation.y += dt * 0.8;
    const dx = pp.x - p.x;
    const dz = pp.z - p.z;
    if (dx * dx + dz * dz < 2.2 * 2.2) collectPickup(p);
  }
}

// ------------------------------------------------------- save / respawn / start
function saveNow() {
  try {
    const defsLen = (missions && missions.defs && missions.defs.length) || 10;
    const pos = playerPos();
    let stationVal = 0;
    if (progress) {
      if (progress.station !== undefined) stationVal = progress.station;
      else if (progress.stationIdx !== undefined) stationVal = progress.stationIdx;
      else if (typeof progress.stationNow === 'function') {
        const st = progress.stationNow();
        if (st) stationVal = st.id !== undefined ? st.id : (st.index !== undefined ? st.index : 0);
      }
    }
    saveGame({
      cash: typeof player.cash === 'number' ? player.cash : 250,
      missionIdx: Math.min(missions ? (missions.idx || 0) : 0, defsLen - 1),
      health: playerHealth(),
      position: { x: pos.x, z: pos.z },
      rep: progress.rep !== undefined ? progress.rep : 0,
      rankIdx: progress.rankIdx !== undefined ? progress.rankIdx : 0,
      owned: progress.owned,
      ammo: progress.ammo,
      weapon: progress.weapon,
      tune: progress.tune,
      armor: progress.armor,
      station: stationVal,
    });
  } catch (e) {
    window.__errors.push('save: ' + (e.message || e));
  }
}

function onStoryComplete() {
  saveNow();
}

function hospitalPos() {
  if (city.landmarks && city.landmarks.hospital) return city.landmarks.hospital;
  if (city.hospital) return city.hospital;
  if (city.landmarks && Array.isArray(city.landmarks)) {
    for (const lm of city.landmarks) {
      if (lm && (lm.name === 'hospital' || lm.id === 'hospital')) return lm;
    }
  }
  return { x: 0, z: 0 };
}

function respawn(atHospital) {
  const hosp = hospitalPos();
  setPlayerPos(hosp.x + 8, hosp.z + 8);
  setPlayerAngle(Math.PI);
  setPlayerHealth(100);
  if (isDriving()) exitCar();
  try {
    if (typeof police.clear === 'function') police.clear();
    else if (typeof police.reset === 'function') police.reset();
    else police.wanted = 0;
  } catch (e) {}
  try {
    if (typeof roadblocks.clear === 'function') roadblocks.clear();
    else if (typeof roadblocks.reset === 'function') roadblocks.reset();
  } catch (e) {}
  if (hud && typeof hud.hideOverlays === 'function') hud.hideOverlays();
  game.state = 'playing';
  if (atHospital && missions && missions.state && missions.state !== 'idle') {
    if (typeof missions.restart === 'function') missions.restart();
    else if (typeof missions.start === 'function') missions.start(missions.idx || 0);
  }
}

function startGame(opts) {
  opts = opts || {};
  if (audio) {
    if (typeof audio.ensure === 'function') audio.ensure();
    if (typeof audio.startMusic === 'function') audio.startMusic();
  }
  if (hud && typeof hud.hideOverlays === 'function') hud.hideOverlays();
  game.state = 'playing';
  if (opts.fromSave) {
    let save = null;
    try { save = loadSave(); } catch (e) { save = null; }
    if (save) {
      player.cash = save.cash !== undefined ? save.cash : 250;
      setPlayerHealth(save.health !== undefined ? save.health : 100);
      const sx = save.position ? (save.position.x !== undefined ? save.position.x : 150)
        : (save.x !== undefined ? save.x : 150);
      const sz = save.position ? (save.position.z !== undefined ? save.position.z : -130)
        : (save.z !== undefined ? save.z : -130);
      setPlayerPos(sx, sz);
      if (save.rep !== undefined) progress.rep = save.rep;
      if (save.rankIdx !== undefined) progress.rankIdx = save.rankIdx;
      if (save.owned !== undefined) progress.owned = save.owned;
      if (save.ammo !== undefined) progress.ammo = save.ammo;
      if (save.weapon !== undefined) {
        const owned = progress.owned;
        const hasIt = !owned || (Array.isArray(owned) && owned.indexOf(save.weapon) !== -1)
          || (owned instanceof Set && owned.has(save.weapon));
        if (hasIt) progress.weapon = save.weapon;
      }
      if (save.tune !== undefined) progress.tune = save.tune;
      if (save.armor !== undefined) progress.armor = save.armor;
      if (save.station !== undefined) {
        if ('station' in progress) progress.station = save.station;
        else if ('stationIdx' in progress) progress.stationIdx = save.station;
      }
      if (audio && typeof audio.setStation === 'function') {
        let st = null;
        try { st = typeof progress.stationNow === 'function' ? progress.stationNow() : null; } catch (e) { st = null; }
        audio.setStation(st || STATIONS[0]);
      }
      missions.idx = save.missionIdx || 0;
      if (typeof missions.start === 'function') missions.start(missions.idx);
    }
  } else if (missions.state === 'idle') {
    if (typeof missions.start === 'function') missions.start();
  }
  if (!opts.silent) toast('Selamat datang di Solmar Bay! Ikuti penanda misi.');
}

function togglePause() {
  if (game.state === 'playing') {
    game.state = 'paused';
    if (hud && typeof hud.showOverlay === 'function') hud.showOverlay('pause');
    saveNow();
  } else if (game.state === 'paused') {
    game.state = 'playing';
    if (hud && typeof hud.hideOverlays === 'function') hud.hideOverlays();
  }
}

function stopSiren() {
  if (!audio) return;
  if (typeof audio.stopSiren === 'function') audio.stopSiren();
  else if (typeof audio.setSiren === 'function') audio.setSiren(false);
  else if (typeof audio.siren === 'function') audio.siren(false);
}

// ------------------------------------------------------------------ combat
let dangerPos = null;
const _tmpDir = new THREE.Vector3();
const _tmpOrigin = new THREE.Vector3();

// The minimap reads each roadblock car as car.pos, but Roadblocks stores
// its cars as {obj, mesh, x, z, ...} with no .pos. Without this alias the
// minimap throws every frame while a roadblock is up, which aborts the
// frame before rendering. Sync it every frame: blocks spawn and expire
// continuously, so a one-time alias is not enough.
function syncRoadblockCarPos() {
  try {
    const blocks = roadblocks.blocks || [];
    for (const b of blocks) {
      const cars = (b && b.cars) || [];
      for (const car of cars) {
        if (car && !car.pos) {
          if (car.obj && car.obj.position) car.pos = car.obj.position;
          else if (car.mesh && car.mesh.position) car.pos = car.mesh.position;
          else if (car.x !== undefined) car.pos = car;
        }
      }
    }
  } catch (e) {}
}

function doPunch() {
  const pp = playerPos();
  const ang = playerAngle();
  const fx = Math.sin(ang);
  const fz = Math.cos(ang);
  _tmpOrigin.set(pp.x, 1.2, pp.z);
  _tmpDir.set(fx, 0, fz);
  try {
    if (typeof combat.punch === 'function') combat.punch(_tmpOrigin, _tmpDir);
  } catch (e) {}
  if (audio && typeof audio.punch === 'function') audio.punch();
  dangerPos = new THREE.Vector3(pp.x, 0, pp.z);
  particles.burst(
    { x: pp.x + fx * 0.9, y: 1.1, z: pp.z + fz * 0.9 },
    { count: 8, colors: [0xcbb98a, 0x9a8a6a], speed: 2.5, life: 0.4, size: 0.3 }
  );
  const w = currentWeaponDef();
  game._fireCd = (w && w.rate) || 0.35;
}

function doShoot() {
  const w = currentWeaponDef() || {};
  const pp = playerPos();
  _tmpOrigin.set(pp.x, 1.5, pp.z);
  camera.getWorldDirection(_tmpDir);
  let enemies = [];
  try {
    enemies = typeof combat.livingEnemies === 'function' ? combat.livingEnemies() : (combat.enemies || []);
  } catch (e) {
    enemies = combat.enemies || [];
  }
  const pellets = w.pellets || 1;
  const spread = w.spread || 0;
  for (let i = 0; i < pellets; i++) {
    const dir = _tmpDir.clone();
    dir.x += (Math.random() - 0.5) * spread;
    dir.y += (Math.random() - 0.5) * spread;
    dir.z += (Math.random() - 0.5) * spread;
    dir.normalize();
    try {
      if (typeof combat.shoot === 'function') combat.shoot(_tmpOrigin, dir, w.range || 60, enemies, w.damage || 10);
    } catch (e) {}
  }
  particles.flash({ x: pp.x + _tmpDir.x * 0.8, y: 1.5, z: pp.z + _tmpDir.z * 0.8 });
  if (audio && typeof audio.gunshot === 'function') audio.gunshot();
  if (police && typeof police.addHeat === 'function') police.addHeat(2);
  dangerPos = new THREE.Vector3(pp.x, 0, pp.z);
  game._fireCd = w.rate || 0.25;
}

// Enemies that just died: explosion + one-time cash drop. Works whether
// combat.enemies lists every enemy or livingEnemies() lists only the living.
const _prevLiving = new Map();

function detectDeaths() {
  let all = combat.enemies || null;
  let living = [];
  try {
    living = typeof combat.livingEnemies === 'function' ? combat.livingEnemies() : [];
  } catch (e) {
    living = [];
  }
  if (!living) living = [];
  if (all && all.length) {
    for (const e of all) {
      const dead = e.alive === false || e.dead === true
        || (typeof e.health === 'number' && e.health <= 0);
      if (dead && !e._fxDone) {
        e._fxDone = true;
        const ep = getPos(e) || { x: 0, y: 0, z: 0 };
        particles.explosion({ x: ep.x, y: (ep.y || 0) + 1, z: ep.z });
        if (audio && typeof audio.explosion === 'function') audio.explosion();
        if (!e._looted) {
          e._looted = true;
          addPickup('cash', ep.x, ep.z, { respawn: 0, amount: 50 + Math.floor(Math.random() * 61) });
        }
      }
    }
    return;
  }
  // livingEnemies() only: an enemy that vanished from the list just died.
  const cur = new Set(living);
  for (const entry of _prevLiving) {
    const e = entry[0];
    const pos = entry[1];
    if (!cur.has(e) && !e._fxDone) {
      e._fxDone = true;
      particles.explosion(pos);
      if (audio && typeof audio.explosion === 'function') audio.explosion();
      if (!e._looted) {
        e._looted = true;
        addPickup('cash', pos.x, pos.z, { respawn: 0, amount: 50 + Math.floor(Math.random() * 61) });
      }
    }
  }
  _prevLiving.clear();
  for (const e of living) {
    const ep = getPos(e);
    _prevLiving.set(e, { x: ep ? ep.x : 0, y: (ep && ep.y ? ep.y : 0) + 1, z: ep ? ep.z : 0 });
  }
}

// ------------------------------------------------------------------ camera
function updateSun() {
  const pp = playerPos();
  sun.position.set(pp.x - 220, 55, pp.z + 140);
  sun.target.position.set(pp.x, 0, pp.z);
  sun.target.updateMatrixWorld();
}

function updateCamera(dt) {
  let drag = null;
  try {
    drag = typeof input.consumeMouse === 'function' ? input.consumeMouse() : null;
  } catch (e) {
    drag = null;
  }
  const dx = (drag && drag.dx) || 0;
  const dy = (drag && drag.dy) || 0;
  game.camYaw -= dx * 0.005;
  game.camPitch = clamp(game.camPitch + dy * 0.004, 0.08, 1.05);
  if (game.demoOrbit) game.camYaw += dt * 0.05;
  const car = getCar();
  if (isDriving() && car && Math.abs(dx) < 1) {
    game.camYaw = lerpAngle(game.camYaw, carAngle(car) + Math.PI, dt * 1.4);
  }
  const target = (isDriving() && car) ? carPos(car) : playerPos();
  const dist = game.camDist * (game.camFar ? 1.6 : 1);
  const cp = Math.cos(game.camPitch);
  const sp = Math.sin(game.camPitch);
  camera.position.set(
    target.x + Math.sin(game.camYaw) * cp * dist,
    (target.y || 0) + sp * dist,
    target.z + Math.cos(game.camYaw) * cp * dist
  );
  camera.lookAt(target.x, (target.y || 0) + 1.6, target.z);
}

// -------------------------------------------------------------------- loop
const clock = new THREE.Clock();
let elapsed = 0;
let songTimer = 0;
let smokeAcc = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = (elapsed += dt);

  _curKeys = new Set(KEY_CODES.filter((c) => keyDown(c)));

  city.update(dt, t);
  particles.update(dt);
  updateSun();

  if (game.state === 'menu') {
    game.camYaw += dt * 0.05;
    camera.position.set(Math.sin(game.camYaw) * 190, 90, Math.cos(game.camYaw) * 190);
    camera.lookAt(0, 0, 0);
    traffic.update(dt, null);
    peds.update(dt, { x: 0, z: 0 }, null);
    hud.update(game);
    renderer.render(scene, camera);
    input.endFrame();
    _prevKeys = _curKeys;
    _prevMouse = mouseHeld(0);
    return;
  }

  if (game.state === 'playing') {
    game.clockMinutes += dt * 0.5;

    if (keyPressed('KeyP')) togglePause();
    if (keyPressed('KeyM')) {
      game.muted = !game.muted;
      if (audio) {
        if (typeof audio.setMuted === 'function') audio.setMuted(game.muted);
        else if (typeof audio.mute === 'function') audio.mute(game.muted);
        else if (typeof audio.toggleMute === 'function') audio.toggleMute();
      }
      toast(game.muted ? 'Suara dimatikan' : 'Suara dinyalakan');
    }
    if (keyPressed('KeyC')) game.camFar = !game.camFar;
    if (keyPressed('KeyH') && isDriving()) {
      if (audio) {
        if (typeof audio.horn === 'function') audio.horn();
        else if (typeof audio.playHorn === 'function') audio.playHorn();
      }
    }

    // Weapon slots 1-4.
    const slotNames = ['fists', 'pistol', 'smg', 'shotgun'];
    for (let i = 0; i < 4; i++) {
      if (keyPressed('Digit' + (i + 1))) {
        const name = slotNames[i];
        if (progress && typeof progress.selectWeapon === 'function') progress.selectWeapon(name);
        if (currentWeaponId() === name) {
          toast('Senjata: ' + name);
        } else {
          const def = getWeaponDef(name);
          toast('LOCKED — ' + name + (def && def.price !== undefined ? ' Rp' + def.price : ''));
        }
      }
    }

    // Radio.
    if (keyPressed('KeyR')) {
      let st = null;
      if (progress && typeof progress.nextStation === 'function') st = progress.nextStation();
      let cur = null;
      try { cur = progress && typeof progress.stationNow === 'function' ? progress.stationNow() : null; } catch (e) { cur = null; }
      cur = cur || st;
      if (audio && typeof audio.setStation === 'function') audio.setStation(cur || STATIONS[0]);
      if (cur) {
        const extra = cur.show || cur.song || cur.track || '';
        toast(cur.name + (extra ? ' — ' + extra : ''));
      }
    }

    // Crew.
    if (keyPressed('KeyZ')) {
      let used = false;
      if (progress && typeof progress.useCrew === 'function') used = progress.useCrew();
      if (used !== false) {
        if (police && typeof police.dropStar === 'function') police.dropStar();
        toast('Crew mengalihkan polisi!');
      } else {
        toast('Crew masih cooldown');
      }
    }

    // E: a shop owns E when the player stands at one (shops._nearShop
    // returns the shop id, e.g. 'garage' / 'arms'); main opens it via
    // shops.openShop. A mission dialogue or a steal/grab/hold stage owns E
    // too. Only when nobody owns E does it enter/exit a car. When a shop
    // panel is already open, E belongs to the shop (it closes on E), so
    // main must not even query the key.
    let nearShop = null;
    try {
      if (shops && typeof shops._nearShop === 'function') nearShop = shops._nearShop(playerPos());
    } catch (e) {}
    if (!nearShop && shops) {
      if (typeof shops.nearShop === 'function') {
        try { nearShop = shops.nearShop(playerPos()); } catch (e) {}
      } else if (typeof shops.isNearShop === 'function') {
        try { if (shops.isNearShop(playerPos())) nearShop = shops.currentShop || 'shop'; } catch (e) {}
      }
    }
    const dialogOpen = !!(hud.dialogOpen || missions.dialogOpen || game.dialogOpen || shops.dialogOpen
      || (missions.dialogue && missions.dialogue.length
        && (missions.dialogueIdx === undefined || missions.dialogueIdx < missions.dialogue.length)));
    let stageType = null;
    const stg = missions.currentStage || missions.stage || missions.current
      || (missions && typeof missions.getStage === 'function' ? missions.getStage() : null);
    if (stg) stageType = stg.type || stg.kind || null;
    const eTaken = dialogOpen
      || stageType === 'steal' || stageType === 'grab' || stageType === 'hold';
    if (!shops.open && keyPressed('KeyE')) {
      if (nearShop) {
        if (typeof shops.openShop === 'function') shops.openShop(nearShop);
      } else if (!eTaken) {
        if (isDriving()) exitCar();
        else {
          const car = nearestParkedCar();
          if (car) enterCar(car);
        }
      }
    }

    // Shooting / punching (on foot only).
    if (game._fireCd > 0) game._fireCd -= dt;
    if (!isDriving()) {
      const wid = currentWeaponId();
      if (keyPressed('KeyF')) doPunch();
      else if (game._fireCd <= 0) {
        if (wid === 'fists') {
          if (mouseClicked(0)) doPunch();
        } else {
          const w = currentWeaponDef() || {};
          const auto = w.auto !== undefined ? !!w.auto : wid === 'smg';
          if ((auto && mouseHeld(0)) || (!auto && mouseClicked(0))) {
            if (getAmmo() > 0) {
              setAmmo(getAmmo() - 1);
              doShoot();
            } else {
              toast('Ammo habis!');
              game._fireCd = 0.4;
            }
          }
        }
      }
    }

    player.update(dt, input, { colliders: city.colliders, trafficCars: traffic.cars, camYaw: game.camYaw });

    const car = getCar();
    const driving = isDriving();
    traffic.update(dt, driving && car ? carPos(car) : null);
    peds.update(dt, playerPos(), dangerPos);
    dangerPos = null;

    if (driving && car && typeof peds.checkCarHit === 'function') {
      let hits = 0;
      try { hits = peds.checkCarHit(carPos(car), Math.abs(carSpeedVal(car))); } catch (e) { hits = 0; }
      const n = Array.isArray(hits) ? hits.length : (typeof hits === 'number' ? hits : (hits ? 1 : 0));
      if (n > 0) {
        if (police && typeof police.addHeat === 'function') police.addHeat(30 * n);
        toast('Menabrak pejalan kaki! +' + 30 * n + ' heat');
      }
    }

    let busted = false;
    try {
      const pol = police.update(dt, player, city, audio) || {};
      busted = pol.busted === true;
    } catch (e) {}
    progress.update(dt);
    airUnit.update(dt, playerPos(), police.wanted, t);
    roadblocks.update(dt, police.wanted, playerPos(), driving && car ? carAngle(car) : playerAngle());
    syncRoadblockCarPos();

    if (driving && car && typeof roadblocks.resolve === 'function') {
      let hitBlock = false;
      try { hitBlock = !!roadblocks.resolve(carPos(car), 2.1); } catch (e) { hitBlock = false; }
      if (hitBlock) {
        if (typeof car.speed === 'number') car.speed *= 0.4;
        if (typeof player.carSpeed === 'number') player.carSpeed *= 0.4;
        if (typeof car.condition === 'number') {
          car.condition -= 5;
          if (car.condition < 35) car.smoking = true;
        } else {
          car.smoking = true;
        }
        toast('Menabrak roadblock! Mobil rusak');
      }
    }

    shops.update(dt);

    songTimer += dt;
    if (songTimer > 24) {
      songTimer = 0;
      if (progress && typeof progress.nextSong === 'function') progress.nextSong();
    }

    try {
      combat.update(dt, playerPos(), (dmg) => {
        // Body armor absorbs damage first when the progress module reports
        // a remainder; fall back to full damage if it returns nothing.
        let rest = dmg;
        if (progress && typeof progress.absorbDamage === 'function') {
          const r = progress.absorbDamage(dmg);
          if (typeof r === 'number') rest = r;
        }
        if (rest > 0) {
          if (typeof player.damage === 'function') player.damage(rest);
          else setPlayerHealth(playerHealth() - rest);
        }
      }, audio);
    } catch (e) {}
    detectDeaths();
    updatePickups(dt, t);
    updateCamera(dt);

    // Smoking car: smoke puffs from the engine, throttled to 0.12 s.
    const smoking = !!(car && (car.smoking || player.smoking));
    if (driving && smoking) {
      smokeAcc += dt;
      if (smokeAcc >= 0.12) {
        smokeAcc = 0;
        const cp = carPos(car);
        const ca = carAngle(car);
        particles.smoke(
          { x: cp.x + Math.sin(ca) * 1.5, y: (cp.y || 0) + 1.2, z: cp.z + Math.cos(ca) * 1.5 },
          { count: 2 }
        );
      }
    } else {
      smokeAcc = 0;
    }

    if (audio && typeof audio.setEngine === 'function') {
      if (driving) audio.setEngine(true, Math.abs(carSpeedVal(car)) / 38);
      else audio.setEngine(false, 0);
    }

    if (playerHealth() <= 0) {
      game.state = 'wasted';
      if (audio && typeof audio.setEngine === 'function') audio.setEngine(false, 0);
      stopSiren();
      if (hud && typeof hud.showOverlay === 'function') hud.showOverlay('wasted');
    } else if (busted) {
      game.state = 'busted';
      stopSiren();
      if (audio && typeof audio.bust === 'function') audio.bust();
      if (hud && typeof hud.showOverlay === 'function') hud.showOverlay('busted');
    }
  }

  hud.update(game);
  renderer.render(scene, camera);
  _prevKeys = _curKeys;
  _prevMouse = mouseHeld(0);
  input.endFrame();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ------------------------------------------------------------ DOM buttons
const btnStart = document.getElementById('btn-start');
if (btnStart) btnStart.addEventListener('click', () => startGame());
const btnContinue = document.getElementById('btn-continue');
if (btnContinue) btnContinue.addEventListener('click', () => startGame({ fromSave: true }));
const btnResume = document.getElementById('btn-resume');
if (btnResume) btnResume.addEventListener('click', () => togglePause());
const btnRespawn = document.getElementById('btn-respawn');
if (btnRespawn) {
  btnRespawn.addEventListener('click', () => {
    player.cash = Math.floor((typeof player.cash === 'number' ? player.cash : 0) / 2);
    respawn(true);
  });
}
const btnRespawnBusted = document.getElementById('btn-respawn-busted');
if (btnRespawnBusted) {
  btnRespawnBusted.addEventListener('click', () => {
    player.cash = Math.max(0, (typeof player.cash === 'number' ? player.cash : 0) - 100);
    respawn(true);
  });
}
const btnKeepPlaying = document.getElementById('btn-keep-playing');
if (btnKeepPlaying) {
  btnKeepPlaying.addEventListener('click', () => {
    if (hud && typeof hud.hideOverlays === 'function') hud.hideOverlays();
  });
}
const btnNewGame = document.getElementById('btn-new-game');
if (btnNewGame) {
  btnNewGame.addEventListener('click', () => {
    clearSave();
    window.location.reload();
  });
}

// Hide Continue when there is no save.
try {
  if (btnContinue && !loadSave()) btnContinue.style.display = 'none';
} catch (e) {}

// Autopilot (selftest / demo / shot modes) + start overlay.
const params = new URLSearchParams(window.location.search);
const isShot = params.has('shot');
const isDemo = params.has('demo');
const isSelftest = params.has('selftest');
try {
  applyAutopilot(game);
} catch (e) {
  window.__errors.push('autopilot: ' + (e.message || e));
}
if (!isShot && !isDemo && !isSelftest) {
  if (hud && typeof hud.showOverlay === 'function') hud.showOverlay('start');
}

// Debug handle for live verification (selftest / screenshots).
window.__game = game;

animate();
