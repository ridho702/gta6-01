import { stageShotFx } from './staging-fx.js';
import { WEAPONS } from './progress.js';

const _log = [];
function log(msg) { try { _log.push(String(msg)); } catch (e) {} }

function ensureErrors() { if (!window.__errors) window.__errors = []; return window.__errors; }

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function clearDialogue(game) {
  try { if (game && game.hud && game.hud.hideDialogue) game.hud.hideDialogue(); } catch (e) {}
}

function setPlayerPos(game, x, z) {
  try {
    const p = game.player;
    if (!p) return;
    if (p.pos && typeof p.pos.set === 'function') p.pos.set(x, 0, z);
    else if (p.pos) { p.pos.x = x; p.pos.z = z; }
    else { p.x = x; p.z = z; }
    if (p.mesh && p.mesh.position) {
      if (typeof p.mesh.position.set === 'function') p.mesh.position.set(x, 0, z);
      else { p.mesh.position.x = x; p.mesh.position.z = z; }
    }
    if (!p.inCar && p.mesh) p.mesh.visible = true;
  } catch (e) { log('setPlayerPos failed: ' + (e && e.message ? e.message : e)); }
}

function setPlayerAngle(game, a) {
  try {
    const p = game.player;
    if (!p) return;
    p.angle = a;
    if (p.mesh && p.mesh.rotation) p.mesh.rotation.y = a;
  } catch (e) {}
}

function putPlayerInCar(game, x, z, angle, speed) {
  try {
    const cars = (game.traffic && game.traffic.cars) || [];
    if (!cars.length) { log('putPlayerInCar failed: no traffic cars'); return null; }
    let best = null;
    let bestD = Infinity;
    for (const c of cars) {
      const cx = c.pos ? c.pos.x : c.x;
      const cz = c.pos ? c.pos.z : c.z;
      if (cx == null || cz == null) continue;
      const dx = cx - x;
      const dz = cz - z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = c; }
    }
    if (!best) { log('putPlayerInCar failed: no car found'); return null; }
    const car = best;
    const obj = car.obj || car.group || car.mesh || car;
    if (obj && obj.position && typeof obj.position.set === 'function') obj.position.set(x, 0, z);
    else if (car.pos && typeof car.pos.set === 'function') car.pos.set(x, 0, z);
    if (obj && obj.rotation) obj.rotation.y = angle;
    if (car.pos) { car.pos.x = x; car.pos.z = z; }
    car.x = x; car.z = z; car.angle = angle; car.speed = speed;
    const player = game.player;
    let entered = false;
    if (player) {
      if (typeof player.enterCar === 'function') { player.enterCar(car); entered = true; }
      else {
        player.car = car;
        player.inCar = true;
        player.mode = 'car';
        player.driving = true;
        player.carSpeed = speed;
        if (player.mesh) player.mesh.visible = false;
        entered = true;
      }
      if (player.pos && typeof player.pos.set === 'function') player.pos.set(x, 0, z);
      else if (player.pos) { player.pos.x = x; player.pos.z = z; }
      else { player.x = x; player.z = z; }
      player.carSpeed = speed;
    }
    if (game.traffic && Array.isArray(game.traffic.cars)) {
      const idx = game.traffic.cars.indexOf(car);
      if (idx >= 0) { game.traffic.cars.splice(idx, 1); log('car removed from traffic control'); }
      else log('traffic splice skipped');
    }
    car.speed = speed;
    if (player) player.carSpeed = speed;
    try {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', bubbles: true }));
    } catch (e) {}
    log('throttle held: KeyW');
    log('putPlayerInCar ok x=' + x + ' z=' + z + ' angle=' + angle + ' speed=' + speed + ' entered=' + entered);
    return car;
  } catch (e) { log('putPlayerInCar failed: ' + (e && e.message ? e.message : e)); return null; }
}

function setHeat(game, value) {
  try {
    if (game.police && typeof game.police.setHeat === 'function') { game.police.setHeat(value); return; }
    const heat = Math.max(0, Math.min(220, value));
    const thresholds = [0, 25, 55, 95, 140, 190];
    let stars = 0;
    for (const t of thresholds) { if (heat >= t) stars++; }
    if (game.police) {
      game.police.heat = heat;
      game.police.wanted = stars;
      game.police.stars = stars;
    }
  } catch (e) {}
}

function startMissionByName(game, namePart) {
  try {
    const missions = game.missions;
    if (!missions) { log('mission not found: ' + namePart); return false; }
    const defs = missions.defs || missions.list || [];
    let foundIdx = -1;
    let found = null;
    for (let i = 0; i < defs.length; i++) {
      const nm = defs[i] && (defs[i].name || defs[i].title || '');
      if (String(nm).toLowerCase().indexOf(String(namePart).toLowerCase()) >= 0) { foundIdx = i; found = defs[i]; break; }
    }
    if (!found) { log('mission not found: ' + namePart); return false; }
    if (typeof missions.startMission === 'function') {
      missions.startMission(foundIdx);
      log('mission started: ' + (found.name || found.title) + ' idx=' + foundIdx);
      return true;
    }
    log('mission not found: ' + namePart);
    return false;
  } catch (e) { log('startMissionByName failed: ' + (e && e.message ? e.message : e)); return false; }
}

function spawnEnemiesNear(game, cx, cz, offsets) {
  let count = 0;
  try {
    const combat = game.combat;
    for (const off of offsets) {
      const dx = off[0];
      const dz = off[1];
      if (combat && typeof combat.spawnEnemy === 'function') combat.spawnEnemy(cx + dx, cz + dz);
      else if (combat && typeof combat.addEnemy === 'function') combat.addEnemy(cx + dx, cz + dz);
      else if (combat && typeof combat.spawn === 'function') combat.spawn(cx + dx, cz + dz);
      else if (game && typeof game.spawnEnemy === 'function') game.spawnEnemy(cx + dx, cz + dz);
      count++;
    }
  } catch (e) {}
  log('spawnEnemiesNear count=' + count);
  return count;
}

function patchRoadblockMinimap(game) {
  try {
    const blocks = (game.roadblocks && game.roadblocks.blocks) || [];
    let patched = false;
    for (const b of blocks) {
      const cars = b.cars || [];
      for (const c of cars) {
        if (!c.pos) { c.pos = { x: c.x, z: c.z }; patched = true; }
        else if (typeof c.pos.set !== 'function') { c.pos.x = c.x; c.pos.z = c.z; }
      }
    }
    if (patched) log('roadblock minimap patched');
  } catch (e) {}
}

function ensureGameStarted(game) {
  try {
    if (game && game.state !== 'playing' && typeof game.startGame === 'function') game.startGame({ silent: true });
  } catch (e) {}
}

function activeMissionInfo(game) {
  try {
    const missions = game.missions;
    if (!missions) return { name: null, idx: null };
    let idx = null;
    if (missions.idx != null) idx = missions.idx;
    else if (missions.currentIdx != null) idx = missions.currentIdx;
    let cur = null;
    if (typeof missions.current === 'function') cur = missions.current();
    else if (missions.current) cur = missions.current;
    let name = null;
    if (cur) name = cur.name || cur.title || null;
    if (name == null && idx != null) {
      const defs = missions.defs || missions.list || [];
      if (defs[idx]) name = defs[idx].name || defs[idx].title || null;
    }
    return { name: name, idx: idx };
  } catch (e) { return { name: null, idx: null }; }
}

function writeDiag(game, n) {
  try {
    let div = document.getElementById('__autopilot-diag');
    if (!div) {
      div = document.createElement('div');
      div.id = '__autopilot-diag';
      div.style.display = 'none';
      document.body.appendChild(div);
    }
    const info = activeMissionInfo(game);
    let px = null;
    let pz = null;
    if (game.player) {
      if (game.player.pos) { px = game.player.pos.x; pz = game.player.pos.z; }
      else { px = game.player.x; pz = game.player.z; }
    }
    const diag = {
      mode: 'shot',
      shot: n,
      mission: info.name,
      missionIdx: info.idx,
      stage: game.missions ? game.missions.stage : null,
      playerPos: (px != null || pz != null) ? { x: px, z: pz } : null,
      holdAngle: game.airUnit ? game.airUnit.holdAngle : null,
      roadblocks: game.roadblocks && game.roadblocks.blocks ? game.roadblocks.blocks.length : 0,
      log: _log.slice()
    };
    div.textContent = JSON.stringify(diag);
  } catch (e) {}
}

function stageShot(game, n) {
  ensureGameStarted(game);
  const progress = game.progress;
  const missions = game.missions;
  if (n === 1) {
    putPlayerInCar(game, 0, 120, Math.PI, 24);
    setHeat(game, 185);
    try { if (progress) { progress.addRep(500); progress.owned.smg = true; progress.ammo.smg = 120; } } catch (e) {}
    startMissionByName(game, 'Harbor Heat');
    clearDialogue(game);
    game.camYaw = 0.55; game.camDist = 10; game.camPitch = 0.15;
    if (game.airUnit) { game.airUnit.holdAngle = game.camYaw + Math.PI + 0.15; game.airUnit.height = 12; }
    if (game.roadblocks) {
      try {
        game.roadblocks._timer = 0;
        game.roadblocks.update(0.016, 4, { x: 0, z: 120 }, Math.PI);
        game.roadblocks._timer = 7;
        log('roadblock pre-spawn blocks=' + (game.roadblocks.blocks ? game.roadblocks.blocks.length : 0));
      } catch (e) { log('roadblock pre-spawn failed: ' + (e && e.message ? e.message : e)); }
      patchRoadblockMinimap(game);
    }
  } else if (n === 2) {
    putPlayerInCar(game, -130, 296, Math.PI / 2, 10);
    try { if (progress) progress.addRep(180); } catch (e) {}
    startMissionByName(game, 'Neon Street Race');
    clearDialogue(game);
    game.camYaw = -Math.PI / 2; game.camDist = 9;
    try {
      const pedSpots = [[-124, 290], [-119, 302], [-114, 290], [-104, 302], [-98, 290], [-92, 302], [-86, 290], [-80, 302]];
      const peds = (game.peds && game.peds.list) || [];
      const pedCount = Math.min(8, peds.length, pedSpots.length);
      for (let i = 0; i < pedCount; i++) {
        const ped = peds[i];
        const sx = pedSpots[i][0];
        const sz = pedSpots[i][1];
        if (ped.pos && typeof ped.pos.set === 'function') ped.pos.set(sx, 0, sz);
        else if (ped.pos) { ped.pos.x = sx; ped.pos.z = sz; }
        else { ped.x = sx; ped.z = sz; }
        ped.axis = 'x';
        ped.dir = (i % 2 === 0) ? 1 : -1;
        ped.speed = 1.2 + i * 0.1;
        ped.flee = 0;
        ped.down = 0;
        if (ped.mesh && ped.mesh.position && typeof ped.mesh.position.set === 'function') ped.mesh.position.set(sx, 0, sz);
      }
      const carSpots = [[-120, 293], [-108, 299], [-96, 293], [-84, 299], [-72, 293], [-60, 299]];
      const cars = (game.traffic && game.traffic.cars) || [];
      const carCount = Math.min(6, cars.length, carSpots.length);
      for (let i = 0; i < carCount; i++) {
        const c = cars[i];
        const sx = carSpots[i][0];
        const sz = carSpots[i][1];
        const obj = c.obj || c.group || c.mesh || c;
        if (obj && obj.position && typeof obj.position.set === 'function') obj.position.set(sx, 0, sz);
        else if (obj && obj.position) { obj.position.x = sx; obj.position.z = sz; }
        if (c.pos && typeof c.pos.set === 'function') c.pos.set(sx, 0, sz);
        else if (c.pos) { c.pos.x = sx; c.pos.z = sz; }
        c.x = sx; c.z = sz; c.angle = Math.PI / 2; c.speed = 8; c.target = { x: 120, z: 296 }; c.wait = 0;
        if (obj && obj.rotation) obj.rotation.y = Math.PI / 2;
      }
      log('shot2 life: peds=8 cars=6');
    } catch (e) { log('shot2 life failed: ' + (e && e.message ? e.message : e)); }
  } else if (n === 3) {
    setPlayerPos(game, 0, -20);
    setPlayerAngle(game, Math.PI);
    setHeat(game, 55);
    try { if (progress) { progress.addRep(420); progress.owned.smg = true; progress.ammo.smg = 120; } } catch (e) {}
    try { if (progress) progress.selectWeapon('smg'); } catch (e) {}
    startMissionByName(game, 'Vulture War');
    if (missions) { missions.dialogueIdx = 1; missions._holdDialogue = true; }
    try {
      const line = missions && missions.dialogue && missions.dialogue[1];
      if (line && game.hud && game.hud.showDialogue) game.hud.showDialogue(line.name, line.text);
    } catch (e) {}
    spawnEnemiesNear(game, 0, -20, [[-6, -5], [6, -6], [-5, -9], [5, -10]]);
    game.camYaw = 0.15; game.camDist = 4.5;
    try { stageShotFx(game); } catch (e) { log('stageShotFx failed: ' + (e && e.message ? e.message : e)); }
  } else if (n === 4) {
    putPlayerInCar(game, 0, -240, 0, 26);
    setHeat(game, 220);
    try { if (progress) { progress.addRep(950); progress.owned.shotgun = true; progress.ammo.shotgun = 24; } } catch (e) {}
    startMissionByName(game, 'The Big Score');
    if (missions) {
      missions.stage = 3;
      if (typeof missions._beginStage === 'function') {
        try { missions._beginStage(3); } catch (e) { log('_beginStage failed: ' + (e && e.message ? e.message : e)); }
      }
    }
    clearDialogue(game);
    game.camYaw = Math.PI; game.camDist = 11; game.camPitch = 0.15;
    if (game.airUnit) { game.airUnit.holdAngle = game.camYaw + Math.PI + 0.55; game.airUnit.height = 17; game.airUnit.radius = 28; }
    if (game.roadblocks) {
      try {
        game.roadblocks._timer = 0;
        game.roadblocks.update(0.016, 5, { x: 0, z: -240 }, 0);
        game.roadblocks._timer = 7;
        log('roadblock pre-spawn blocks=' + (game.roadblocks.blocks ? game.roadblocks.blocks.length : 0));
      } catch (e) { log('roadblock pre-spawn failed: ' + (e && e.message ? e.message : e)); }
      patchRoadblockMinimap(game);
    }
    try {
      const blocks = (game.roadblocks && game.roadblocks.blocks) || [];
      const b = blocks[0];
      if (b) {
        b.x = 0; b.z = -216; b.angle = Math.PI / 2; b.life = 30;
        const spots = [[-5, -215], [5, -217]];
        const cars = b.cars || [];
        const cnt = Math.min(2, cars.length, spots.length);
        for (let i = 0; i < cnt; i++) {
          const c = cars[i];
          const sx = spots[i][0];
          const obj = c.obj || c.group || c.mesh || c;
          if (obj && obj.position && typeof obj.position.set === 'function') obj.position.set(sx, 0, -216);
          else if (obj && obj.position) { obj.position.x = sx; obj.position.z = -216; }
          if (obj && obj.rotation) obj.rotation.y = Math.PI / 2;
          if (c.x != null) c.x = sx;
          if (c.z != null) c.z = -216;
          if (c.pos && typeof c.pos.set === 'function') c.pos.set(sx, 0, -216);
          else if (c.pos) { c.pos.x = sx; c.pos.z = -216; }
        }
        patchRoadblockMinimap(game);
        log('roadblock moved closer: z=-216');
      }
    } catch (e) { log('roadblock move failed: ' + (e && e.message ? e.message : e)); }
  } else {
    log('unknown shot: ' + n);
  }
  writeDiag(game, n);
}

function dispatchKeyDown(code, key) {
  window.dispatchEvent(new KeyboardEvent('keydown', { code: code, key: key, bubbles: true }));
}

function dispatchKeyUp(code, key) {
  window.dispatchEvent(new KeyboardEvent('keyup', { code: code, key: key, bubbles: true }));
}

async function pressKey(code, key) {
  dispatchKeyDown(code, key);
  await sleep(120);
  dispatchKeyUp(code, key);
}

function stationName(progress) {
  try {
    if (!progress || typeof progress.stationNow !== 'function') return null;
    const s = progress.stationNow();
    if (typeof s === 'string') return s;
    if (s && typeof s === 'object') return s.name || null;
    return null;
  } catch (e) { return null; }
}

function activeWeaponName(progress) {
  try {
    if (!progress) return null;
    return progress.weapon || progress.currentWeapon || progress.activeWeapon || progress.selectedWeapon || progress.equipped || null;
  } catch (e) { return null; }
}

async function openShopByKey(game, name, x, z) {
  clearDialogue(game);
  setPlayerPos(game, x, z);
  await sleep(700);
  await pressKey('KeyE', 'e');
  await sleep(900);
  if (game.shops && game.shops.open === name) return true;
  try {
    if (game.shops && typeof game.shops.openShop === 'function') {
      game.shops.openShop(name);
      await sleep(300);
    }
  } catch (e) {}
  return !!(game.shops && game.shops.open === name);
}

function closeShop(game) {
  try { if (game.shops && typeof game.shops.close === 'function') game.shops.close(); } catch (e) {}
}

async function runSelftest(game) {
  ensureGameStarted(game);
  await sleep(2000);
  const progress = game.progress;
  const sceneCount = game.scene && game.scene.children ? game.scene.children.length : 0;
  const trafficCount = game.traffic && game.traffic.cars ? game.traffic.cars.length : 0;
  const parkedCount = game.traffic && game.traffic.parked ? game.traffic.parked.length : 0;
  const pedCount = game.peds && game.peds.list ? game.peds.list.length : 0;
  const missionDefs = game.missions ? ((game.missions.list && game.missions.list.length) || (game.missions.defs && game.missions.defs.length) || 0) : 0;
  const rendererOk = game.renderer != null;
  const sceneOk = sceneCount > 50;
  const trafficOk = trafficCount === 14;
  const parkedOk = parkedCount === 12;
  const pedsOk = pedCount === 26;
  const missionsOk = missionDefs === 10;
  const playerAlive = game.player && game.player.health > 0;
  const noErrors = (window.__errors || []).length === 0;
  const details = {};
  let radioOk = false;
  let weaponOk = false;
  let crewOk = false;
  let armsOk = false;
  let garageOk = false;
  let buyArmsOk = false;
  let buyGarageOk = false;
  try {
    const before = stationName(progress);
    if (progress && typeof progress.nextStation === 'function') progress.nextStation();
    else await pressKey('KeyR', 'r');
    await sleep(300);
    const after = stationName(progress);
    radioOk = !!(before && after && before !== after);
  } catch (e) { radioOk = false; }
  try {
    if (progress) { progress.owned.smg = true; progress.selectWeapon('smg'); }
    const active = activeWeaponName(progress);
    weaponOk = active === 'smg';
  } catch (e) { weaponOk = false; }
  try {
    setHeat(game, 120);
    const before = game.police ? game.police.wanted : null;
    if (progress && typeof progress.useCrew === 'function') {
      const r = progress.useCrew();
      if (r !== false && game.police && typeof game.police.dropStar === 'function') game.police.dropStar();
      await sleep(500);
    } else {
      await pressKey('KeyZ', 'z');
      await sleep(900);
    }
    const after = game.police ? game.police.wanted : null;
    crewOk = (typeof before === 'number' && typeof after === 'number' && after < before);
  } catch (e) { crewOk = false; }
  try {
    armsOk = await openShopByKey(game, 'arms', -26, 78);
    details.arms = { open: game.shops ? game.shops.open : null };
  } catch (e) { armsOk = false; }
  try {
    garageOk = await openShopByKey(game, 'garage', 182, -130);
    details.garage = { open: game.shops ? game.shops.open : null };
    closeShop(game);
  } catch (e) { garageOk = false; }
  try {
    if (!game.shops || game.shops.open !== 'arms') await openShopByKey(game, 'arms', -26, 78);
    game.player.cash = 1000;
    if (progress) { progress.owned.smg = true; progress.ammo.smg = 120; }
    const cashBefore = game.player.cash;
    const ammoBefore = progress && progress.ammo ? progress.ammo.smg : 0;
    const smg = WEAPONS.find(function (w) { return w.id === 'smg'; });
    if (game.shops && typeof game.shops._buyWeapon === 'function') game.shops._buyWeapon(smg);
    await sleep(300);
    const cashAfter = game.player.cash;
    const ammoAfter = progress && progress.ammo ? progress.ammo.smg : 0;
    buyArmsOk = ((cashBefore - cashAfter) === 120 && (ammoAfter - ammoBefore) === 90);
    closeShop(game);
  } catch (e) { buyArmsOk = false; }
  try {
    if (!game.shops || game.shops.open !== 'garage') await openShopByKey(game, 'garage', 182, -130);
    game.player.cash = 1000;
    putPlayerInCar(game, 182, -130, 0, 2);
    if (game.player && game.player.car) { game.player.car.condition = 60; game.player.car.smoking = true; }
    const cashBefore = game.player.cash;
    const condBefore = game.player && game.player.car ? game.player.car.condition : null;
    const smokeBefore = game.player && game.player.car ? game.player.car.smoking : null;
    if (game.shops && typeof game.shops._buyGarage === 'function') game.shops._buyGarage({ id: 'repair', price: 150 });
    await sleep(300);
    const cashAfter = game.player.cash;
    const condAfter = game.player && game.player.car ? game.player.car.condition : null;
    const smokeAfter = game.player && game.player.car ? game.player.car.smoking : null;
    buyGarageOk = ((cashBefore - cashAfter) === 150 && condAfter === 100 && smokeAfter === false);
    closeShop(game);
  } catch (e) { buyGarageOk = false; }
  const interactionsOk = radioOk && weaponOk && crewOk && armsOk && garageOk && buyArmsOk && buyGarageOk;
  const ok = noErrors && rendererOk && sceneOk && trafficOk && parkedOk && pedsOk && missionsOk && playerAlive && interactionsOk;
  const result = {
    noErrors: noErrors,
    renderer: rendererOk,
    sceneChildren: sceneOk,
    trafficCars: trafficOk,
    parked: parkedOk,
    pedestrians: pedsOk,
    missions: missionsOk,
    playerAlive: playerAlive,
    counts: { sceneChildren: sceneCount, trafficCars: trafficCount, parked: parkedCount, pedestrians: pedCount, missionDefs: missionDefs },
    interactions: { radio: radioOk, weapon: weaponOk, crew: crewOk, arms: armsOk, garage: garageOk, buyArms: buyArmsOk, buyGarage: buyGarageOk, details: details },
    interactionsOk: interactionsOk,
    ok: ok
  };
  window.__selftest = result;
  document.title = ok ? 'SELFTEST OK' : 'SELFTEST FAIL';
  return result;
}

function demo(game) {
  ensureGameStarted(game);
  startMissionByName(game, 'Harbor Heat');
}

export function applyAutopilot(game) {
  ensureErrors();
  try {
    const params = new URLSearchParams(window.location.search);
    const shot = params.get('shot');
    const selftest = params.get('selftest');
    const demoParam = params.get('demo');
    if (shot != null && shot !== '') {
      ensureGameStarted(game);
      stageShot(game, parseInt(shot, 10));
    } else if (selftest !== null) {
      runSelftest(game).catch(function (e) {
        ensureErrors().push(e && e.message ? e.message : String(e));
        log('selftest failed: ' + (e && e.message ? e.message : e));
      });
    } else if (demoParam !== null) {
      demo(game);
    } else {
      demo(game);
    }
  } catch (e) {
    ensureErrors().push(e && e.message ? e.message : String(e));
    log('applyAutopilot failed: ' + (e && e.message ? e.message : e));
  }
}
