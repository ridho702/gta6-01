// Solmar Bay — entry point. Builds the renderer, lights and camera, wires
// every system together, and runs the game loop and the state machine
// (menu / playing / paused / wasted / busted). The game is a plain ES
// module over the vendored three.js global; it loads no network resources.

import { RNG, clamp } from './util.js';
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

const THREE = window.THREE;

window.__errors = [];
window.addEventListener('error', (e) => {
  window.__errors.push(String(e.message || e.error || 'unknown error'));
});

const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fc8e8);
scene.fog = new THREE.Fog(0xbfd9e8, 220, 720);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1600);

const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.95);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe8c0, 1.35);
sun.position.set(150, 230, 90);
scene.add(sun);

// ---------- systems ----------
const rng = new RNG(2026);
const city = buildCity(THREE);
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

const game = {
  THREE,
  scene,
  camera,
  renderer,
  city,
  traffic,
  peds,
  player,
  police,
  combat,
  hud,
  audio,
  input,
  clockMinutes: 480, // 08:00
  camYaw: 0.6,
  camPitch: 0.42,
  camDist: 9,
  camFar: false,
  state: 'menu',
  demoOrbit: false,
  muted: false,
  saveNow,
  onStoryComplete,
  startGame,
};
const missions = new Missions(game);
game.missions = missions;

// ---------- pickups: health (green), ammo (yellow), cash (gold) ----------
const pickups = [];
function spawnPickup(kind, x, z) {
  const colors = { health: 0x30c040, ammo: 0xe8c832, cash: 0xffd21f };
  const geo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
  const mat = new THREE.MeshLambertMaterial({ color: colors[kind], emissive: colors[kind], emissiveIntensity: 0.35 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, 0.9, z);
  mesh.rotation.y = Math.PI / 4;
  scene.add(mesh);
  pickups.push({ kind, mesh, pos: { x, z }, respawn: 0, taken: false });
}
const pickupSpots = [
  ['health', 170, -140], ['health', -200, -200], ['health', 230, 10], ['health', -150, 110],
  ['ammo', 180, -150], ['ammo', -100, 50], ['ammo', 240, -50], ['ammo', -230, 150],
];
for (const [kind, x, z] of pickupSpots) spawnPickup(kind, x, z);

function updatePickups(dt) {
  const pp = player.getPos();
  for (const p of pickups) {
    if (p.taken) {
      p.respawn -= dt;
      if (p.respawn <= 0) {
        p.taken = false;
        p.mesh.visible = true;
      }
      continue;
    }
    p.mesh.rotation.y += dt * 1.5;
    p.mesh.position.y = 0.9 + Math.sin(performance.now() * 0.003 + p.pos.x) * 0.15;
    const d = Math.sqrt((pp.x - p.pos.x) ** 2 + (pp.z - p.pos.z) ** 2);
    if (d < 2.2) {
      p.taken = true;
      p.mesh.visible = false;
      p.respawn = 45;
      if (p.kind === 'health') {
        player.heal(40);
        hud.toast('Health +40');
      } else if (p.kind === 'ammo') {
        player.ammo += 24;
        hud.toast('Ammo +24');
      } else {
        const amount = 50 + Math.floor(rng.next() * 60);
        player.cash += amount;
        hud.toast('Cash +$' + amount);
      }
      if (audio) audio.pickup();
    }
  }
  // Enemies drop cash where they fall.
  for (const e of combat.enemies) {
    if (!e.alive && !e._looted) {
      e._looted = true;
      spawnPickup('cash', e.pos.x, e.pos.z);
    }
  }
}

// ---------- save / story ----------
function saveNow() {
  const pp = player.getPos();
  saveGame({
    cash: player.cash,
    missionIdx: Math.min(missions.idx, missions.defs.length - 1),
    health: player.health,
    pos: { x: pp.x, z: pp.z },
  });
}

function onStoryComplete() {
  saveNow();
}

function respawn(atHospital) {
  const h = city.landmarks.hospital;
  player.pos.x = h.x + 8;
  player.pos.z = h.z + 8;
  player.angle = Math.PI;
  player.health = 100;
  if (player.mode === 'car') {
    if (player.car) scene.remove(player.car.mesh);
    player.car = null;
    player.mode = 'foot';
    player.mesh.visible = true;
  }
  player.mesh.position.set(player.pos.x, 0, player.pos.z);
  police.clear();
  hud.hideOverlays();
  game.state = 'playing';
  if (atHospital) missions.startMission(missions.idx);
}

// ---------- start / pause ----------
function startGame(opts) {
  const o = opts || {};
  audio.ensure();
  audio.startMusic();
  hud.hideOverlays();
  game.state = 'playing';
  const save = o.fromSave ? loadSave() : null;
  if (save) {
    player.cash = save.cash || 250;
    player.health = save.health || 100;
    player.pos.x = save.pos ? save.pos.x : 150;
    player.pos.z = save.pos ? save.pos.z : -130;
    player.mesh.position.set(player.pos.x, 0, player.pos.z);
    missions.idx = save.missionIdx || 0;
    missions.startMission(missions.idx);
  } else if (missions.state === 'idle') {
    missions.start();
  }
  if (!o.silent) hud.toast('Welcome to Solmar Bay — follow the yellow beacon');
}

function togglePause() {
  if (game.state === 'playing') {
    game.state = 'paused';
    hud.showOverlay('pause');
    saveNow();
  } else if (game.state === 'paused') {
    game.state = 'playing';
    hud.hideOverlays();
  }
}

// ---------- overlay buttons ----------
function wireButton(id, fn) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', fn);
}
wireButton('btn-start', () => startGame());
wireButton('btn-continue', () => startGame({ fromSave: true }));
wireButton('btn-resume', () => togglePause());
wireButton('btn-respawn', () => {
  player.cash = Math.floor(player.cash / 2);
  respawn(true);
});
wireButton('btn-respawn-busted', () => {
  player.cash = Math.max(0, player.cash - 100);
  respawn(true);
});
wireButton('btn-keep-playing', () => hud.hideOverlays());
wireButton('btn-new-game', () => {
  clearSave();
  window.location.reload();
});
// Show Continue only when a save exists.
if (!loadSave()) {
  const b = document.getElementById('btn-continue');
  if (b) b.style.display = 'none';
}

// ---------- camera ----------
function updateCamera(dt) {
  const drag = input.consumeMouse();
  game.camYaw -= drag.dx * 0.005;
  game.camPitch = clamp(game.camPitch + drag.dy * 0.004, 0.08, 1.05);
  if (game.demoOrbit) game.camYaw += dt * 0.12;
  const target = player.mode === 'car' && player.car ? player.car.pos : player.pos;
  const dist = game.camDist * (game.camFar ? 1.6 : 1);
  const cp = Math.cos(game.camPitch);
  const sp = Math.sin(game.camPitch);
  const cx = target.x + Math.sin(game.camYaw) * cp * dist;
  const cz = target.z + Math.cos(game.camYaw) * cp * dist;
  const cy = 1.6 + sp * dist;
  camera.position.set(cx, cy, cz);
  // Look at a fixed height above the target: car positions carry no y.
  camera.lookAt(target.x, 1.6, target.z);
}

// ---------- main loop ----------
const clock = new THREE.Clock();
let dangerPos = null;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  city.update(dt, t);

  if (game.state === 'menu') {
    // Living backdrop behind the start screen.
    game.camYaw += dt * 0.05;
    camera.position.set(Math.sin(game.camYaw) * 190, 90, Math.cos(game.camYaw) * 190);
    camera.lookAt(0, 0, 0);
    traffic.update(dt, null);
    peds.update(dt, { x: 0, z: 0 }, null);
    hud.update(game);
    renderer.render(scene, camera);
    input.endFrame();
    return;
  }

  if (game.state === 'playing') {
    game.clockMinutes += dt * 0.5;
    // Global keys.
    if (input.wasPressed('KeyP')) togglePause();
    if (input.wasPressed('KeyM')) {
      game.muted = !game.muted;
      audio.setMuted(game.muted);
      hud.toast(game.muted ? 'Muted' : 'Sound on');
    }
    if (input.wasPressed('KeyC')) game.camFar = !game.camFar;
    if (input.wasPressed('KeyH') && player.mode === 'car') audio.horn();

    // Enter / exit cars (E). Mission stages that own the E key
    // (steal, grab, hold) and open dialogue handle it themselves.
    const st = missions.currentStage();
    const dialogueOpen = missions.dialogueIdx < missions.dialogue.length;
    const eOwned = dialogueOpen || (st && ['steal', 'grab', 'hold'].includes(st.type));
    if (!eOwned && input.wasPressed('KeyE')) {
      if (player.mode === 'foot') {
        const near = traffic.nearestParked(player.pos, 4.5);
        if (near) player.enterCar(near);
      } else {
        player.exitCar();
      }
    }

    // Shooting (left mouse) and punching (F), on foot only.
    if (player.mode === 'foot') {
      if (input.clicked() && player.ammo > 0) {
        player.ammo--;
        const origin = { x: player.pos.x, y: 1.5, z: player.pos.z };
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        // Slight spread.
        dir.x += (Math.random() - 0.5) * 0.02;
        dir.y += (Math.random() - 0.5) * 0.02;
        dir.z += (Math.random() - 0.5) * 0.02;
        dir.normalize();
        combat.shoot(origin, { x: dir.x, y: dir.y, z: dir.z }, 80, combat.livingEnemies());
        audio.gunshot();
        police.addHeat(2);
        dangerPos = { x: player.pos.x, z: player.pos.z };
      }
      if (input.wasPressed('KeyF')) {
        const f = player.facing();
        combat.punch({ x: player.pos.x, y: 1.2, z: player.pos.z }, f, combat.livingEnemies());
        audio.punch();
        dangerPos = { x: player.pos.x, z: player.pos.z };
      }
    }

    player.update(dt, input, {
      colliders: city.colliders,
      trafficCars: traffic.cars,
      camYaw: game.camYaw,
    });
    traffic.update(dt, player.mode === 'car' ? player.car.pos : null);
    const pp = player.getPos();
    peds.update(dt, pp, dangerPos);
    dangerPos = null;
    // Running someone over is a crime.
    if (player.mode === 'car') {
      const hits = peds.checkCarHit(player.car.pos, Math.abs(player.carSpeed || 0));
      if (hits > 0) {
        police.addHeat(30 * hits);
        hud.toast('You ran someone over! The cops are coming.');
      }
    }
    const policeResult = police.update(dt, player, city, audio);
    combat.update(dt, pp, (dmg) => {
      player.damage(dmg);
    }, audio);
    missions.update(dt);
    updatePickups(dt);
    updateCamera(dt);

    // Engine hum.
    if (player.mode === 'car') {
      audio.setEngine(true, Math.abs(player.carSpeed || 0) / 38);
    } else {
      audio.setEngine(false, 0);
    }

    // Wasted / busted.
    if (player.health <= 0) {
      game.state = 'wasted';
      audio.setEngine(false, 0);
      audio.siren(false);
      hud.showOverlay('wasted');
    } else if (policeResult.busted) {
      game.state = 'busted';
      audio.siren(false);
      audio.bust();
      hud.showOverlay('busted');
    }
  }

  hud.update(game);
  renderer.render(scene, camera);
  input.endFrame();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Autopilot (screenshots / demo / self-test) may auto-start the game.
const ap = applyAutopilot(game);
if (!ap.shot && !ap.demo && !ap.selftest) {
  hud.showOverlay('start');
}

animate();
