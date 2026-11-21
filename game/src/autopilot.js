import { stageShotFx } from './staging-fx.js';
import { WEAPONS } from './progress.js';

const _log = [];

function log(msg) {
  try {
    _log.push(String(msg));
  } catch (e) {}
}

function ensureErrors() {
  if (!window.__errors) window.__errors = [];
  return window.__errors;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clearDialogue(game) {
  try {
    if (game && game.hud && typeof game.hud.hideDialogue === 'function') {
      game.hud.hideDialogue();
    }
  } catch (e) {}
}

function setPlayerPos(game, x, z) {
  try {
    const p = game.player;
    if (!p) return;
    if (p.pos && typeof p.pos.set === 'function') {
      p.pos.set(x, 0, z);
    } else if (p.pos) {
      p.pos.x = x;
      p.pos.z = z;
    } else {
      p.x = x;
      p.z = z;
    }
    if (p.mesh && p.mesh.position && typeof p.mesh.position.set === 'function') {
      p.mesh.position.set(x, 0, z);
    }
    if (!p.inCar && p.mesh) {
      p.mesh.visible = true;
    }
  } catch (e) {
    log('setPlayerPos failed: ' + (e && e.message ? e.message : e));
  }
}

function setPlayerAngle(game, a) {
  try {
    const p = game.player;
    if (!p) return;
    p.angle = a;
    if (p.mesh && p.mesh.rotation) {
      p.mesh.rotation.y = a;
    }
  } catch (e) {}
}

function putPlayerInCar(game, x, z, angle, speed) {
  try {
    const cars = game && game.traffic ? game.traffic.cars : null;
    if (!cars || !cars.length) {
      log('putPlayerInCar failed: no traffic cars');
      return null;
    }
    let best = null;
    let bestD = Infinity;
    for (const c of cars) {
      const cx = c.pos ? c.pos.x : (typeof c.x === 'number' ? c.x : 0);
      const cz = c.pos ? c.pos.z : (typeof c.z === 'number' ? c.z : 0);
      const dx = cx - x;
      const dz = cz - z;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    if (!best) {
      log('putPlayerInCar failed: no nearest car');
      return null;
    }
    const car = best;
    const obj = car.obj || car.group || car.mesh || car;
    if (obj && obj.position && typeof obj.position.set === 'function') {
      obj.position.set(x, 0, z);
    } else if (car.pos && typeof car.pos.set === 'function') {
      car.pos.set(x, 0, z);
    } else if (car.pos) {
      car.pos.x = x;
      car.pos.z = z;
    }
    if (obj && obj.rotation) {
      obj.rotation.y = angle;
    }
    if (car.pos && typeof car.pos.set !== 'function') {
      car.pos.x = x;
      car.pos.z = z;
    }
    car.x = x;
    car.z = z;
    car.angle = angle;
    car.speed = speed;

    let entered = false;
    const player = game.player;
    if (player && typeof player.enterCar === 'function') {
      player.enterCar(car);
      entered = true;
    } else if (player) {
      player.car = car;
      player.inCar = true;
      player.mode = 'car';
      player.driving = true;
      player.carSpeed = speed;
      if (player.mesh) player.mesh.visible = false;
      entered = true;
    }
    try {
      if (player) {
        if (player.pos && typeof player.pos.set === 'function') {
          player.pos.set(x, 0, z);
        } else if (player.pos) {
          player.pos.x = x;
          player.pos.z = z;
        }
      }
    } catch (e) {}
    try {
      if (player && player.mesh && player.inCar) {
        player.mesh.visible = false;
      }
    } catch (e) {}

    // (j) Remove this car from traffic control so the traffic system
    // no longer steers it or collides it with itself every frame.
    try {
      if (game.traffic && Array.isArray(game.traffic.cars)) {
        const idx = game.traffic.cars.indexOf(car);
        if (idx >= 0) {
          game.traffic.cars.splice(idx, 1);
          log('car removed from traffic control');
        } else {
          log('traffic splice skipped');
        }
      } else {
        log('traffic splice skipped');
      }
    } catch (e) {
      log('traffic splice skipped');
    }

    // Hold the throttle: keep the speed set and dispatch one KeyW
    // keydown with NO matching keyup.
    try {
      car.speed = speed;
      if (player) player.carSpeed = speed;
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', bubbles: true }));
      log('throttle held: KeyW');
    } catch (e) {
      log('throttle dispatch failed: ' + (e && e.message ? e.message : e));
    }

    log('putPlayerInCar ok x=' + x + ' z=' + z + ' angle=' + angle + ' speed=' + speed + ' entered=' + entered);
    return car;
  } catch (e) {
    log('putPlayerInCar failed: ' + (e && e.message ? e.message : e));
    return null;
  }
}

function setHeat(game, value) {
  try {
    if (game.police && typeof game.police.setHeat === 'function') {
      game.police.setHeat(value);
      return;
    }
    const heat = Math.max(0, Math.min(220, value));
    const thresholds = [0, 25, 55, 95, 140, 190];
    let stars = 0;
    for (let s = 0; s < thresholds.length; s++) {
      if (heat >= thresholds[s]) stars = s;
    }
    if (game.police) {
      game.police.heat = heat;
      game.police.wanted = stars;
      if ('stars' in game.police) game.police.stars = stars;
    }
  } catch (e) {
    log('setHeat failed: ' + (e && e.message ? e.message : e));
  }
}

function startMissionByName(game, namePart) {
  try {
    const missions = game.missions;
    if (!missions) {
      log('mission not found: ' + namePart);
      return false;
    }
    const defs = missions.defs || missions.list || [];
    const needle = String(namePart).toLowerCase();
    let foundIdx = -1;
    for (let i = 0; i < defs.length; i++) {
      const d = defs[i];
      if (!d) continue;
      const nm = (d.name || d.title || '').toLowerCase();
      if (nm && nm.indexOf(needle) >= 0) {
        foundIdx = i;
        break;
      }
    }
    if (foundIdx < 0) {
      log('mission not found: ' + namePart);
      return false;
    }
    if (typeof missions.startMission === 'function') {
      missions.startMission(foundIdx);
    } else {
      log('mission not found: ' + namePart);
      return false;
    }
    const def = defs[foundIdx];
    log('mission started: ' + (def.name || def.title || namePart) + ' idx=' + foundIdx);
    return true;
  } catch (e) {
    log('startMissionByName failed: ' + (e && e.message ? e.message : e));
    return false;
  }
}

function spawnEnemiesNear(game, cx, cz, offsets) {
  let count = 0;
  try {
    const combat = game.combat;
    if (!combat) {
      log('spawnEnemiesNear count=0');
      return 0;
    }
    for (const off of offsets) {
      const ex = cx + off[0];
      const ez = cz + off[1];
      try {
        if (typeof combat.spawnEnemy === 'function') {
          combat.spawnEnemy(ex, ez);
          count++;
        } else if (typeof combat.addEnemy === 'function') {
          combat.addEnemy(ex, ez);
          count++;
        } else if (typeof combat.spawn === 'function') {
          combat.spawn(ex, ez);
          count++;
        }
      } catch (e) {}
    }
  } catch (e) {}
  log('spawnEnemiesNear count=' + count);
  return count;
}

function patchRoadblockMinimap(game) {
  try {
    const blocks = game.roadblocks ? game.roadblocks.blocks : null;
    if (!blocks || !blocks.length) return;
    let patched = false;
    for (const b of blocks) {
      if (!b || !b.cars) continue;
      for (const c of b.cars) {
        if (!c) continue;
        if (!c.pos) {
          c.pos = { x: c.x, z: c.z };
          patched = true;
        } else if (typeof c.pos.set !== 'function') {
          c.pos.x = c.x;
          c.pos.z = c.z;
          patched = true;
        }
      }
    }
    if (patched) log('roadblock minimap patched');
  } catch (e) {}
}

function ensureGameStarted(game) {
  try {
    if (game && game.state !== 'playing' && typeof game.startGame === 'function') {
      game.startGame({ silent: true });
    }
  } catch (e) {
    log('startGame failed: ' + (e && e.message ? e.message : e));
  }
}

function activeMissionInfo(game) {
  let name = null;
  let idx = null;
  try {
    const missions = game.missions;
    if (!missions) return { name: null, idx: null };
    if (typeof missions.idx === 'number') idx = missions.idx;
    if (typeof missions.currentIdx === 'number') idx = missions.currentIdx;
    let cur = null;
    if (typeof missions.current === 'function') {
      try { cur = missions.current(); } catch (e) {}
    } else if (missions.current && typeof missions.current === 'object') {
      cur = missions.current;
    }
    if (cur) {
      name = cur.name || cur.title || null;
      if (idx === null && (missions.defs || missions.list)) {
        const defs = missions.defs || missions.list;
        const i = defs.indexOf(cur);
        if (i >= 0) idx = i;
      }
    }
    if (name === null && idx !== null) {
      const defs = missions.defs || missions.list;
      if (defs && defs[idx]) name = defs[idx].name || defs[idx].title || null;
    }
  } catch (e) {}
  return { name: name, idx: idx };
}

function writeDiag(game, n) {
  try {
    let el = document.getElementById('__autopilot-diag');
    if (!el) {
      el = document.createElement('div');
      el.id = '__autopilot-diag';
      el.style.display = 'none';
      document.body.appendChild(el);
    }
    const info = activeMissionInfo(game);
    const diag = {
      mode: 'shot',
      shot: n,
      mission: info.name,
      missionIdx: info.idx,
      stage: game.missions ? game.missions.stage : null,
      playerPos: game.player && game.player.pos
        ? { x: game.player.pos.x, z: game.player.pos.z }
        : null,
      holdAngle: game.airUnit ? game.airUnit.holdAngle : null,
      roadblocks: game.roadblocks && game.roadblocks.blocks ? game.roadblocks.blocks.length : 0,
      log: _log.slice(),
    };
    el.textContent = JSON.stringify(diag);
  } catch (e) {}
}

function stageShot(game, n) {
  ensureGameStarted(game);
  const progress = game.progress;
  const missions = game.missions;

  if (n === 1) {
    putPlayerInCar(game, 0, 120, Math.PI, 24);
    setHeat(game, 185);
    try { game.progress.addRep(500); } catch (e) {}
    progress.owned.smg = true;
    progress.ammo.smg = 120;
    startMissionByName(game, 'Harbor Heat');
    clearDialogue(game);
    game.camYaw = 0.55;
    game.camDist = 10;
    game.camPitch = 0.15;
    if (game.airUnit) {
      game.airUnit.holdAngle = game.camYaw + Math.PI + 0.15;
      game.airUnit.height = 12;
    }
    if (game.roadblocks) {
      try {
        game.roadblocks._timer = 0;
        game.roadblocks.update(0.016, 4, { x: 0, z: 120 }, Math.PI);
        game.roadblocks._timer = 7;
        log('roadblock pre-spawn blocks=' + (game.roadblocks.blocks ? game.roadblocks.blocks.length : 0));
      } catch (e) {
        log('roadblock pre-spawn failed: ' + (e && e.message ? e.message : e));
      }
      patchRoadblockMinimap(game);
    }
  } else if (n === 2) {
    putPlayerInCar(game, -130, 296, Math.PI / 2, 10);
    try { game.progress.addRep(180); } catch (e) {}
    startMissionByName(game, 'Neon Street Race');
    clearDialogue(game);
    game.camYaw = -Math.PI / 2;
    game.camDist = 9;
    try {
      const pedSpots = [[-115, 290], [-95, 303], [-75, 289], [-55, 304], [-35, 290], [-15, 303]];
      const peds = game.peds ? game.peds.list : null;
      if (peds) {
        for (let i = 0; i < Math.min(6, peds.length, pedSpots.length); i++) {
          try {
            const ped = peds[i];
            const sx = pedSpots[i][0];
            const sz = pedSpots[i][1];
            if (ped.pos && typeof ped.pos.set === 'function') {
              ped.pos.set(sx, 0, sz);
            } else if (ped.pos) {
              ped.pos.x = sx;
              ped.pos.z = sz;
            } else {
              ped.x = sx;
              ped.z = sz;
            }
            ped.axis = 'x';
            ped.dir = i % 2 === 0 ? 1 : -1;
            ped.speed = 1.2 + i * 0.1;
            ped.flee = 0;
            ped.down = 0;
            if (ped.mesh && ped.mesh.position && typeof ped.mesh.position.set === 'function') {
              ped.mesh.position.set(sx, 0, sz);
            }
          } catch (e) {}
        }
      }
      const carSpots = [[-100, 296], [-70, 292], [-45, 300], [-20, 294]];
      const cars = game.traffic ? game.traffic.cars : null;
      if (cars) {
        for (let i = 0; i < Math.min(4, cars.length, carSpots.length); i++) {
          try {
            const c = cars[i];
            const sx = carSpots[i][0];
            const sz = carSpots[i][1];
            const obj = c.obj || c.group || c.mesh || c;
            if (obj && obj.position && typeof obj.position.set === 'function') {
              obj.position.set(sx, 0, sz);
            } else if (c.pos && typeof c.pos.set === 'function') {
              c.pos.set(sx, 0, sz);
            } else if (c.pos) {
              c.pos.x = sx;
              c.pos.z = sz;
            }
            c.x = sx;
            c.z = sz;
            c.angle = Math.PI / 2;
            c.speed = 8;
            c.target = { x: 120, z: 296 };
            c.wait = 0;
            if (obj && obj.position && typeof obj.position.set !== 'function') {
              obj.position.x = sx;
              obj.position.z = sz;
            }
            if (obj && obj.rotation) obj.rotation.y = Math.PI / 2;
          } catch (e) {}
        }
      }
      log('shot2 life: peds=6 cars=4');
    } catch (e) {
      log('shot2 life failed: ' + (e && e.message ? e.message : e));
    }
  } else if (n === 3) {
    setPlayerPos(game, 0, -20);
    setPlayerAngle(game, Math.PI);
    setHeat(game, 55);
    try { game.progress.addRep(420); } catch (e) {}
    progress.owned.smg = true;
    progress.ammo.smg = 120;
    try { progress.selectWeapon('smg'); } catch (e) {}
    startMissionByName(game, 'Vulture War');
    missions.dialogueIdx = 1;
    missions._holdDialogue = true;
    try {
      const line = missions.dialogue && missions.dialogue[1];
      if (line && game.hud && typeof game.hud.showDialogue === 'function') {
        game.hud.showDialogue(line.name, line.text);
      }
    } catch (e) {}
    spawnEnemiesNear(game, 0, -20, [[-3, -6], [4, -7], [2, -10], [-7, -8]]);
    game.camYaw = 0.15;
    game.camDist = 4.5;
    try {
      stageShotFx(game);
    } catch (e) {
      log('stageShotFx failed: ' + (e && e.message ? e.message : e));
    }
  } else if (n === 4) {
    putPlayerInCar(game, 0, -240, 0, 26);
    setHeat(game, 220);
    try { game.progress.addRep(950); } catch (e) {}
    progress.owned.shotgun = true;
    progress.ammo.shotgun = 24;
    startMissionByName(game, 'The Big Score');
    missions.stage = 3;
    if (missions._beginStage) {
      try {
        missions._beginStage(3);
      } catch (e) {
        log('_beginStage failed: ' + (e && e.message ? e.message : e));
      }
    }
    clearDialogue(game);
    game.camYaw = Math.PI;
    game.camDist = 11;
    game.camPitch = 0.15;
    if (game.airUnit) {
      game.airUnit.holdAngle = game.camYaw + Math.PI + 0.55;
      game.airUnit.height = 17;
      game.airUnit.radius = 28;
    }
    if (game.roadblocks) {
      try {
        game.roadblocks._timer = 0;
        game.roadblocks.update(0.016, 5, { x: 0, z: -240 }, 0);
        game.roadblocks._timer = 7;
        log('roadblock pre-spawn blocks=' + (game.roadblocks.blocks ? game.roadblocks.blocks.length : 0));
      } catch (e) {
        log('roadblock pre-spawn failed: ' + (e && e.message ? e.message : e));
      }
      patchRoadblockMinimap(game);
    }
    try {
      const blocks = game.roadblocks ? game.roadblocks.blocks : null;
      const b = blocks && blocks.length ? blocks[0] : null;
      if (b) {
        b.x = 0;
        b.z = -208;
        b.angle = Math.PI / 2;
        b.life = 30;
        const spots = [[-3, -208], [3, -208]];
        for (let i = 0; i < Math.min(2, b.cars.length, spots.length); i++) {
          const c = b.cars[i];
          const sx = spots[i][0];
          const sz = spots[i][1];
          const obj = c.obj || c.group || c.mesh || c;
          if (obj && obj.position && typeof obj.position.set === 'function') {
            obj.position.set(sx, 0, -208);
          } else if (obj && obj.position) {
            obj.position.x = sx;
            obj.position.z = -208;
          }
          if (obj && obj.rotation) {
            obj.rotation.y = Math.PI / 2;
          }
          if ('x' in c) c.x = sx;
          if ('z' in c) c.z = -208;
          if (c.pos && typeof c.pos.set === 'function') {
            c.pos.set(sx, 0, -208);
          } else if (c.pos) {
            c.pos.x = sx;
            c.pos.z = -208;
          }
        }
        patchRoadblockMinimap(game);
        log('roadblock moved closer: z=-208');
      }
    } catch (e) {
      log('roadblock move failed: ' + (e && e.message ? e.message : e));
    }
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
    const s = progress.stationNow();
    if (!s) return null;
    if (typeof s === 'string') return s;
    return s.name || null;
  } catch (e) {
    return null;
  }
}

function activeWeaponName(progress) {
  try {
    return progress.weapon || progress.currentWeapon || progress.activeWeapon || progress.selectedWeapon || progress.equipped || null;
  } catch (e) {
    return null;
  }
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
  try {
    if (game.shops && typeof game.shops.close === 'function') {
      game.shops.close();
    }
  } catch (e) {}
}

async function runSelftest(game) {
  try {
    ensureGameStarted(game);
  } catch (e) {}
  await sleep(2000);

  const sceneCount = game.scene && game.scene.children ? game.scene.children.length : 0;
  const trafficCount = game.traffic && game.traffic.cars ? game.traffic.cars.length : 0;
  const parkedCount = game.traffic && game.traffic.parked ? game.traffic.parked.length : 0;
  const pedCount = game.peds && game.peds.list ? game.peds.list.length : 0;
  const missionDefs = game.missions
    ? ((game.missions.list ? game.missions.list.length : 0) || (game.missions.defs ? game.missions.defs.length : 0))
    : 0;

  const rendererOk = game.renderer != null;
  const sceneOk = sceneCount > 50;
  const trafficOk = trafficCount === 14;
  const parkedOk = parkedCount === 12;
  const pedsOk = pedCount === 26;
  const missionsOk = missionDefs === 10;
  const playerAlive = !!(game.player && game.player.health > 0);
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
    const before = stationName(game.progress);
    if (typeof game.progress.nextStation === 'function') {
      game.progress.nextStation();
    } else {
      await pressKey('KeyR', 'r');
    }
    await sleep(300);
    const after = stationName(game.progress);
    details.radio = { before: before, after: after };
    radioOk = !!(before && after && before !== after);
  } catch (e) {
    details.radio = { error: e && e.message ? e.message : String(e) };
    radioOk = false;
  }

  try {
    game.progress.owned.smg = true;
    game.progress.selectWeapon('smg');
    const active = activeWeaponName(game.progress);
    details.weapon = { active: active };
    weaponOk = active === 'smg';
  } catch (e) {
    details.weapon = { error: e && e.message ? e.message : String(e) };
    weaponOk = false;
  }

  try {
    setHeat(game, 120);
    const before = game.police ? game.police.wanted : null;
    if (typeof game.progress.useCrew === 'function') {
      const r = game.progress.useCrew();
      if (r !== false && game.police && typeof game.police.dropStar === 'function') {
        game.police.dropStar();
      }
      await sleep(500);
    } else if (game.police && typeof game.police.dropStar === 'function') {
      await pressKey('KeyZ', 'z');
      await sleep(900);
    } else {
      await pressKey('KeyZ', 'z');
      await sleep(900);
    }
    const after = game.police ? game.police.wanted : null;
    details.crew = { before: before, after: after };
    crewOk = typeof before === 'number' && typeof after === 'number' && after < before;
  } catch (e) {
    details.crew = { error: e && e.message ? e.message : String(e) };
    crewOk = false;
  }

  try {
    armsOk = await openShopByKey(game, 'arms', -26, 78);
    details.arms = { open: game.shops ? game.shops.open : null };
  } catch (e) {
    details.arms = { error: e && e.message ? e.message : String(e) };
    armsOk = false;
  }

  try {
    garageOk = await openShopByKey(game, 'garage', 182, -130);
    details.garage = { open: game.shops ? game.shops.open : null };
    closeShop(game);
  } catch (e) {
    details.garage = { error: e && e.message ? e.message : String(e) };
    garageOk = false;
  }

  try {
    if (!game.shops || game.shops.open !== 'arms') {
      await openShopByKey(game, 'arms', -26, 78);
    }
    game.player.cash = 1000;
    game.progress.owned.smg = true;
    game.progress.ammo.smg = 120;
    const cashBefore = game.player.cash;
    const ammoBefore = game.progress.ammo.smg;
    const smg = WEAPONS.find((w) => w.id === 'smg');
    game.shops._buyWeapon(smg);
    await sleep(300);
    const cashAfter = game.player.cash;
    const ammoAfter = game.progress.ammo.smg;
    details.buyArms = { cashBefore: cashBefore, cashAfter: cashAfter, ammoBefore: ammoBefore, ammoAfter: ammoAfter };
    buyArmsOk = (cashBefore - cashAfter) === 120 && (ammoAfter - ammoBefore) === 90;
    closeShop(game);
  } catch (e) {
    details.buyArms = { error: e && e.message ? e.message : String(e) };
    buyArmsOk = false;
    closeShop(game);
  }

  try {
    if (!game.shops || game.shops.open !== 'garage') {
      await openShopByKey(game, 'garage', 182, -130);
    }
    game.player.cash = 1000;
    putPlayerInCar(game, 182, -130, 0, 2);
    if (game.player.car) {
      game.player.car.condition = 60;
      game.player.car.smoking = true;
    }
    const cashBefore = game.player.cash;
    const condBefore = game.player.car ? game.player.car.condition : null;
    const smokeBefore = game.player.car ? game.player.car.smoking : null;
    game.shops._buyGarage({ id: 'repair', price: 150 });
    await sleep(300);
    const cashAfter = game.player.cash;
    const condAfter = game.player.car ? game.player.car.condition : null;
    const smokeAfter = game.player.car ? game.player.car.smoking : null;
    details.buyGarage = {
      cashBefore: cashBefore, cashAfter: cashAfter,
      conditionBefore: condBefore, conditionAfter: condAfter,
      smokingBefore: smokeBefore, smokingAfter: smokeAfter,
    };
    buyGarageOk = (cashBefore - cashAfter) === 150 && condAfter === 100 && smokeAfter === false;
    closeShop(game);
  } catch (e) {
    details.buyGarage = { error: e && e.message ? e.message : String(e) };
    buyGarageOk = false;
    closeShop(game);
  }

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
    counts: {
      sceneChildren: sceneCount,
      trafficCars: trafficCount,
      parked: parkedCount,
      pedestrians: pedCount,
      missionDefs: missionDefs,
    },
    interactions: {
      radio: radioOk,
      weapon: weaponOk,
      crew: crewOk,
      arms: armsOk,
      garage: garageOk,
      buyArms: buyArmsOk,
      buyGarage: buyGarageOk,
      details: details,
    },
    interactionsOk: interactionsOk,
    ok: ok,
  };

  window.__selftest = result;
  try {
    document.title = ok ? 'SELFTEST OK' : 'SELFTEST FAIL';
  } catch (e) {}
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
    if (shot !== null && shot !== '') {
      ensureGameStarted(game);
      stageShot(game, parseInt(shot, 10));
    } else if (selftest !== null) {
      runSelftest(game).catch((e) => {
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
