// autopilot.js — URL-driven staging for screenshots / demo / selftest.
// Modes (read from the URL query string):
//   ?shot=N&seed=1   stage screenshot N (1-4) and freeze it
//   ?demo=1          slow orbit demo, player on foot at (0,-20)
//   ?selftest=1      run the basic checks, then the interaction checks,
//                    and publish window.__selftest + document.title.
// The menu is skipped via game.startGame({silent:true}).
//
// A hidden <pre id="__autopilot-diag"> is written in shot/selftest mode
// with staging diagnostics (mission name, positions, log) for debugging;
// it is display:none so it never affects the picture.

const LOG = [];
function log(msg) {
  LOG.push(String(msg));
  try { console.log('[autopilot] ' + msg); } catch (e) {}
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

function writeDiag(obj) {
  try {
    window.__diag = obj;
    let el = document.getElementById('__autopilot-diag');
    if (!el) {
      el = document.createElement('pre');
      el.id = '__autopilot-diag';
      el.style.display = 'none';
      document.body.appendChild(el);
    }
    el.textContent = JSON.stringify(obj);
  } catch (e) {}
}

// ---------- small helpers ----------

function clearDialogue(game) {
  try {
    if (game.missions) {
      if (Array.isArray(game.missions.dialogue)) game.missions.dialogue.length = 0;
      game.missions.dialogueIdx = 0;
    }
    if (game.hud && typeof game.hud.hideDialogue === 'function') game.hud.hideDialogue();
  } catch (e) {
    log('clearDialogue: ' + e.message);
  }
}

function setPlayerPos(game, x, z) {
  const p = game.player;
  if (!p) return;
  try {
    const pos = p.pos || p.position;
    if (pos && typeof pos.set === 'function') pos.set(x, pos.y || 0, z);
    else if (pos) { pos.x = x; pos.z = z; }
  } catch (e) {
    log('setPlayerPos: ' + e.message);
  }
  try {
    if (typeof p.x === 'number') p.x = x;
    if (typeof p.z === 'number') p.z = z;
  } catch (e) {}
  try {
    if (p.mesh && p.mesh.position && typeof p.mesh.position.set === 'function') {
      p.mesh.position.set(x, 0, z);
    }
  } catch (e) {}
}

function setPlayerAngle(game, angle) {
  const p = game.player;
  if (!p) return;
  try { if (typeof p.angle === 'number') p.angle = angle; } catch (e) {}
  try { if (typeof p.heading === 'number') p.heading = angle; } catch (e) {}
  try { if (p.mesh && p.mesh.rotation) p.mesh.rotation.y = angle; } catch (e) {}
}

function setObjPos(obj, x, y, z) {
  if (!obj) return false;
  try {
    const p = obj.position || obj.pos;
    if (p && typeof p.set === 'function') { p.set(x, y, z); return true; }
    if (p) { p.x = x; p.y = y; p.z = z; return true; }
    if (typeof obj.x === 'number') { obj.x = x; obj.y = y; obj.z = z; return true; }
  } catch (e) {}
  return false;
}

// Spawn the starter car, put the player in it at (x,z) facing `angle`,
// set its speed, and place the chase camera behind it.
function putPlayerInCar(game, x, z, angle, speed) {
  let car = null;
  // NB: spawnStarterCar is a method on its owner object (it uses
  // `this`, e.g. this.THREE / this.scene), so it must be called with
  // its owner as receiver — calling the bare function reference throws.
  // The (x, z, angle) form is the real one: a no-arg call returns a
  // half-initialised car (angle/pos undefined, later turning NaN), so
  // try (x, z, angle) FIRST and only fall back to no-arg, and accept a
  // car only when its angle/pos are finite numbers.
  const spawners = [];
  if (game.spawnStarterCar) spawners.push([game, 'spawnStarterCar']);
  if (game.vehicles && game.vehicles.spawnStarterCar) spawners.push([game.vehicles, 'spawnStarterCar']);
  if (game.traffic && game.traffic.spawnStarterCar) spawners.push([game.traffic, 'spawnStarterCar']);
  if (game.player && game.player.spawnStarterCar) spawners.push([game.player, 'spawnStarterCar']);
  function carIsSane(c) {
    if (!c) return false;
    if (typeof c.angle !== 'number' || !Number.isFinite(c.angle)) return false;
    if (!c.pos) return false;
    if (typeof c.pos.x !== 'number' || !Number.isFinite(c.pos.x)) return false;
    if (typeof c.pos.z !== 'number' || !Number.isFinite(c.pos.z)) return false;
    return true;
  }
  for (let i = 0; i < spawners.length && !car; i++) {
    const owner = spawners[i][0];
    const name = spawners[i][1];
    try {
      const r = owner[name](x, z, angle);
      if (r && carIsSane(r)) { car = r; log('spawnStarterCar via ' + name + ' (x,z,angle)'); }
      else if (r) log('spawnStarterCar via ' + name + ' (x,z,angle) returned unusable car');
    } catch (e) {
      log('spawnStarterCar(x,z,angle) failed: ' + e.message);
    }
    if (!car) {
      try {
        const r = owner[name]();
        if (r && carIsSane(r)) { car = r; log('spawnStarterCar via ' + name + ' (no-arg)'); }
        else if (r) log('spawnStarterCar via ' + name + ' (no-arg) returned unusable car');
      } catch (e) {
        log('spawnStarterCar no-arg failed: ' + e.message);
      }
    }
  }
  if (!car && game.player && game.player.car) car = game.player.car;
  if (!car) {
    log('putPlayerInCar: no car spawned');
    return null;
  }
  const visual = car.mesh || car.group || car;
  setObjPos(visual, x, 0, z);
  setObjPos(car, x, 0, z);
  try { if (visual && visual.rotation) visual.rotation.y = angle; } catch (e) {}
  try { if (car && car.mesh && car.mesh.rotation) car.mesh.rotation.y = angle; } catch (e) {}
  try { if (car && typeof car.angle === 'number') car.angle = angle; } catch (e) {}
  try { if (car && typeof car.heading === 'number') car.heading = angle; } catch (e) {}
  if (typeof speed === 'number') {
    try { if (car && typeof car.speed === 'number') car.speed = speed; } catch (e) {}
    try { if (car && typeof car.velocity === 'number') car.velocity = speed; } catch (e) {}
    // The player object also carries speed fields the car loop may read.
    try { if (game.player && typeof game.player.carSpeed === 'number') game.player.carSpeed = speed; } catch (e) {}
    try { if (game.player && typeof game.player.speed === 'number') game.player.speed = speed; } catch (e) {}
  }
  let entered = false;
  const enterers = [];
  if (game.player && game.player.enterCar) enterers.push(() => game.player.enterCar(car));
  if (game.enterCar) enterers.push(() => game.enterCar(car));
  if (game.vehicles && game.vehicles.enterCar) enterers.push(() => game.vehicles.enterCar(car));
  for (let i = 0; i < enterers.length; i++) {
    try {
      enterers[i]();
      entered = true;
      break;
    } catch (e) {
      log('enterCar failed: ' + e.message);
    }
  }
  if (!entered && game.player) {
    try {
      game.player.car = car;
      game.player.inCar = true;
    } catch (e) {}
  }
  game.camYaw = angle + Math.PI;
  game.camDist = 13;
  // Hold the throttle (real input, never released): the car's speed field
  // alone decays without throttle, so a held W keeps the chase moving.
  try {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
  } catch (e) {}
  // Keep player.pos glued to the car: the game leaves player.pos at the
  // on-foot spot where the player entered the car, so the heli, police
  // and roadblocks (which all read player.pos) would track that stale
  // point instead of the chase. A short interval re-syncs it.
  try {
    if (game.__posSync) clearInterval(game.__posSync);
    game.__posSync = setInterval(() => {
      try {
        if (car.pos && game.player && game.player.pos) {
          game.player.pos.x = car.pos.x;
          game.player.pos.z = car.pos.z;
        }
      } catch (e) {}
    }, 100);
  } catch (e) {}
  log('putPlayerInCar ok x=' + x + ' z=' + z + ' angle=' + angle + ' speed=' + speed + ' entered=' + entered);
  return car;
}

function setHeat(game, value) {
  const p = game.police;
  if (!p) return;
  try {
    if (typeof p.setHeat === 'function') p.setHeat(value);
    else if ('heat' in p) p.heat = value;
    else if (typeof p.addHeat === 'function') p.addHeat(value);
  } catch (e) {
    log('setHeat heat: ' + e.message);
  }
  // Wanted stars follow heat as floor(heat/50)+1, capped at 5
  // (185 -> 4, 220 -> 5, 55 -> 2). Set it too when the field exists so
  // the heli/roadblocks engage even if wanted is not heat-derived.
  try {
    if ('wanted' in p) {
      p.wanted = Math.max(0, Math.min(5, Math.floor(value / 50) + 1));
    }
  } catch (e) {
    log('setHeat wanted: ' + e.message);
  }
}

function currentMissionName(game) {
  try {
    const m = game.missions;
    if (!m) return null;
    if (m.defs && typeof m.idx === 'number' && m.defs[m.idx]) {
      return m.defs[m.idx].name || m.defs[m.idx].title || null;
    }
    if (m.current) return m.current.name || m.current.title || null;
    return null;
  } catch (e) {
    return null;
  }
}

function startMissionByName(game, namePart) {
  const m = game.missions;
  if (!m) return false;
  const defs = m.defs || [];
  let idx = -1;
  for (let i = 0; i < defs.length; i++) {
    const nm = defs[i] && (defs[i].name || defs[i].title || '');
    if (nm.toLowerCase().indexOf(namePart.toLowerCase()) >= 0) { idx = i; break; }
  }
  if (idx < 0) {
    log('mission not found: ' + namePart);
    return false;
  }
  try {
    if (typeof m.startMission === 'function') {
      m.startMission(idx);
      log('startMission(' + idx + ') -> ' + currentMissionName(game));
      return true;
    }
  } catch (e) {
    log('startMission failed: ' + e.message);
  }
  try {
    m.idx = idx;
    if (typeof m.start === 'function') m.start();
  } catch (e) {}
  return false;
}

function spawnEnemiesNear(game, px, pz, offsets) {
  try {
    if (game.combat && typeof game.combat.clearEnemies === 'function') {
      game.combat.clearEnemies();
    }
  } catch (e) {}
  for (let i = 0; i < offsets.length; i++) {
    try {
      if (game.combat && typeof game.combat.spawnEnemy === 'function') {
        game.combat.spawnEnemy(px + offsets[i][0], pz + offsets[i][1]);
      }
    } catch (e) {
      log('spawnEnemy failed: ' + e.message);
    }
  }
  try {
    log('enemies alive: ' + (game.combat ? game.combat.livingEnemies().length : '?'));
  } catch (e) {}
}

// ---------- shot staging ----------

function stageShot(game, n) {
  if (n === 1) {
    // Chase: car on avenue x=0 heading -z, 4 stars, heli frozen in frame,
    // one roadblock already placed ahead.
    putPlayerInCar(game, 0, 120, Math.PI, 24);
    setHeat(game, 185);
    game.progress.addRep(500);
    game.progress.owned.smg = true;
    game.progress.ammo.smg = 120;
    startMissionByName(game, 'Harbor Heat');
    clearDialogue(game);
    game.camYaw = 0.55;
    game.camDist = 10;
    game.camPitch = 0.15; // level the camera a touch so the heli fits
    if (game.airUnit) {
      try {
        game.airUnit.holdAngle = game.camYaw + Math.PI + 0.15;
        // Drop the heli to ~16 m for the shot: at the normal orbit
        // height (28) it sits above the top of the frame from this
        // chase camera; at 16 it hangs in the upper part of the frame.
        game.airUnit.height = 12;
      } catch (e) {}
    }
    try {
      if (game.roadblocks) {
        game.roadblocks._timer = 0;
        game.roadblocks.update(0.016, 4, { x: 0, z: 120 }, Math.PI);
        // Let the main loop spawn a second block ~7 s in, so one is
        // still ahead of the car when the screenshot is taken.
        game.roadblocks._timer = 7;
        log('roadblock pre-spawn blocks=' + (game.roadblocks.blocks ? game.roadblocks.blocks.length : '?'));
      }
    } catch (e) {
      log('roadblock pre-spawn failed: ' + e.message);
    }
  } else if (n === 2) {
    // Beach drive near the pier / ferris wheel.
    putPlayerInCar(game, -130, 296, Math.PI / 2, 10);
    game.progress.addRep(180);
    startMissionByName(game, 'Neon Street Race');
    clearDialogue(game);
    game.camYaw = -Math.PI / 2;
    game.camDist = 9;
  } else if (n === 3) {
    // On foot, enemies close in and readable, Mira dialogue held.
    setPlayerPos(game, 0, -20);
    setPlayerAngle(game, Math.PI);
    setHeat(game, 55);
    game.progress.addRep(420);
    game.progress.owned.smg = true;
    game.progress.ammo.smg = 120;
    try { game.progress.selectWeapon('smg'); } catch (e) {}
    startMissionByName(game, 'Vulture War');
    try {
      game.missions.dialogueIdx = 1;
      game.missions._holdDialogue = true;
      // The HUD only refreshes the dialogue box when showDialogue is
      // called — setting dialogueIdx alone leaves Marlow's line showing.
      const line = game.missions.dialogue && game.missions.dialogue[1];
      if (line && game.hud && typeof game.hud.showDialogue === 'function') {
        game.hud.showDialogue(line.name, line.text);
      }
    } catch (e) {}
    spawnEnemiesNear(game, 0, -20, [[-3, -6], [4, -7], [2, -10], [-7, -8]]);
    game.camYaw = 0.15;
    game.camDist = 4.5;
  } else if (n === 4) {
    // Final getaway: 5 stars, shotgun, heli frozen in frame.
    putPlayerInCar(game, 0, -240, 0, 26);
    setHeat(game, 220);
    game.progress.addRep(950);
    game.progress.owned.shotgun = true;
    game.progress.ammo.shotgun = 24;
    startMissionByName(game, 'The Big Score');
    try {
      game.missions.stage = 3;
      if (typeof game.missions._beginStage === 'function') game.missions._beginStage(3);
    } catch (e) {
      log('stage3: ' + e.message);
    }
    clearDialogue(game);
    game.camYaw = Math.PI;
    game.camDist = 11;
    game.camPitch = 0.15; // level the camera a touch so the heli fits
    if (game.airUnit) {
      try {
        game.airUnit.holdAngle = game.camYaw + Math.PI + 0.15;
        // Same as shot 1: lower the heli into the frame for the shot.
        game.airUnit.height = 12;
      } catch (e) {}
    }
  } else {
    log('unknown shot: ' + n);
  }
}

// ---------- selftest ----------

function countOf(obj, keys) {
  if (!obj) return -1;
  if (Array.isArray(obj)) return obj.length;
  for (let i = 0; i < keys.length; i++) {
    const v = obj[keys[i]];
    if (Array.isArray(v)) return v.length;
    if (typeof v === 'number') return v;
  }
  return -1;
}

function stationId(game) {
  try {
    if (!game.progress) return undefined;
    if (typeof game.progress.stationNow === 'function') {
      const s = game.progress.stationNow();
      return s && typeof s === 'object' ? (s.name || s.id || JSON.stringify(s)) : s;
    }
    return game.progress.station;
  } catch (e) {
    return undefined;
  }
}

function wantedNow(game) {
  try {
    const p = game.police;
    if (!p) return null;
    if (typeof p.wanted === 'number') return p.wanted;
    if (typeof p.stars === 'number') return p.stars;
    if (typeof p.heat === 'number') return p.heat;
  } catch (e) {}
  return null;
}

function key(code) {
  window.dispatchEvent(new KeyboardEvent('keydown', { code: code }));
}

async function runInteractions(game) {
  const res = {};
  const details = {};
  // (1) Radio: KeyR must change the station.
  try {
    const before = stationId(game);
    key('KeyR');
    await sleep(150);
    const after = stationId(game);
    details.radioBefore = before;
    details.radioAfter = after;
    res.radio = before !== after;
  } catch (e) {
    log('interaction radio: ' + e.message);
    res.radio = false;
  }
  // (2) Weapon slot: Digit3 must select the SMG.
  try {
    game.progress.owned.smg = true;
    game.progress.ammo.smg = 120;
    key('Digit3');
    await sleep(150);
    const cur = game.progress.currentWeapon ? game.progress.currentWeapon() : null;
    details.weapon = cur ? cur.id : null;
    res.weapon = !!cur && cur.id === 'smg';
  } catch (e) {
    log('interaction weapon: ' + e.message);
    res.weapon = false;
  }
  // (3) Crew: add heat, then KeyZ must lower wanted or start cooldown.
  try {
    if (game.police) {
      if (typeof game.police.addHeat === 'function') game.police.addHeat(60);
      else if (typeof game.police.heat === 'number') game.police.heat += 60;
    }
    const w0 = wantedNow(game);
    const cd0 = game.progress ? game.progress.crewCooldown : 0;
    key('KeyZ');
    await sleep(150);
    const w1 = wantedNow(game);
    const cd1 = game.progress ? game.progress.crewCooldown : 0;
    details.wantedBefore = w0;
    details.wantedAfter = w1;
    details.crewCdBefore = cd0;
    details.crewCdAfter = cd1;
    res.crew = (w1 !== null && w0 !== null && w1 < w0) ||
      (typeof cd1 === 'number' && cd1 > 0);
  } catch (e) {
    log('interaction crew: ' + e.message);
    res.crew = false;
  }
  // (4) Arms shop: teleport to the gun shop, KeyE must open 'arms'.
  try {
    setPlayerPos(game, -26, 78);
    await sleep(150);
    clearDialogue(game);
    key('KeyE');
    await sleep(300);
    details.armsOpen = game.shops ? game.shops.open : null;
    res.arms = !!game.shops && game.shops.open === 'arms';
    if (!res.arms) {
      // A dialogue may have swallowed the first KeyE; clear and retry.
      clearDialogue(game);
      key('KeyE');
      await sleep(300);
      details.armsOpenRetry = game.shops ? game.shops.open : null;
      res.arms = !!game.shops && game.shops.open === 'arms';
    }
    if (game.shops && typeof game.shops.close === 'function') game.shops.close();
  } catch (e) {
    log('interaction arms: ' + e.message);
    res.arms = false;
  }
  // (5) Garage: same at the garage landmark, expect 'garage'.
  try {
    setPlayerPos(game, 182, -130);
    await sleep(150);
    clearDialogue(game);
    key('KeyE');
    await sleep(300);
    details.garageOpen = game.shops ? game.shops.open : null;
    res.garage = !!game.shops && game.shops.open === 'garage';
    if (!res.garage) {
      clearDialogue(game);
      key('KeyE');
      await sleep(300);
      details.garageOpenRetry = game.shops ? game.shops.open : null;
      res.garage = !!game.shops && game.shops.open === 'garage';
    }
    if (game.shops && typeof game.shops.close === 'function') game.shops.close();
  } catch (e) {
    log('interaction garage: ' + e.message);
    res.garage = false;
  }
  res.details = details;
  return res;
}

async function runSelftest(game) {
  await sleep(2000);
  const checks = {};
  checks.noErrors = !window.__errors || window.__errors.length === 0;
  checks.renderer = !!game.renderer;
  const sceneCount = game.scene && game.scene.children ? game.scene.children.length : 0;
  checks.sceneChildren = sceneCount > 50;
  const tc = countOf(game.traffic, ['cars', 'active', 'list']);
  checks.trafficCars = tc === 14;
  const pk = countOf(game.traffic, ['parked', 'parkedCars', 'parkedCount']);
  checks.parked = pk === 12;
  const pd = countOf(game.peds, ['list', 'pedestrians', 'people']);
  checks.pedestrians = pd === 26;
  const md = game.missions && game.missions.defs ? game.missions.defs.length : 0;
  checks.missions = md === 10;
  checks.playerAlive = !!game.player && game.player.alive !== false &&
    (game.player.health == null || game.player.health > 0);
  checks.counts = {
    sceneChildren: sceneCount, trafficCars: tc, parked: pk,
    pedestrians: pd, missionDefs: md,
  };
  const inter = await runInteractions(game);
  checks.interactions = inter;
  checks.interactionsOk = !!(inter.radio && inter.weapon && inter.crew && inter.arms && inter.garage);
  const basicOk = checks.noErrors && checks.renderer && checks.sceneChildren &&
    checks.trafficCars && checks.parked && checks.pedestrians &&
    checks.missions && checks.playerAlive;
  checks.ok = basicOk && checks.interactionsOk;
  window.__selftest = checks;
  document.title = checks.ok ? 'SELFTEST OK' : 'SELFTEST FAIL';
  try { console.log('SELFTEST ' + JSON.stringify(checks)); } catch (e) {}
  writeDiag({ mode: 'selftest', checks: checks, log: LOG });
}

// ---------- entry point ----------

export function applyAutopilot(game) {
  let params;
  try {
    params = new URLSearchParams(window.location.search);
  } catch (e) {
    return;
  }
  const shot = params.get('shot');
  const demo = params.get('demo');
  const selftest = params.get('selftest');
  if (!shot && !demo && !selftest) return;
  window.__stageLog = LOG;
  try {
    if (game && typeof game.startGame === 'function') game.startGame({ silent: true });
  } catch (e) {
    log('startGame failed: ' + e.message);
  }
  if (shot) {
    const n = parseInt(shot, 10);
    try {
      stageShot(game, n);
    } catch (e) {
      log('stageShot failed: ' + e.message);
      document.title = 'STAGE ERROR: ' + e.message;
    }
    let playerPos = null;
    try {
      if (game.player && game.player.pos) {
        playerPos = { x: game.player.pos.x, z: game.player.pos.z };
      }
    } catch (e) {}
    writeDiag({
      mode: 'shot', shot: n,
      mission: currentMissionName(game),
      missionIdx: game.missions ? game.missions.idx : null,
      stage: game.missions ? game.missions.stage : null,
      playerPos: playerPos,
      holdAngle: game.airUnit ? game.airUnit.holdAngle : null,
      roadblocks: game.roadblocks && game.roadblocks.blocks ? game.roadblocks.blocks.length : null,
      log: LOG,
    });
  } else if (selftest) {
    runSelftest(game);
  } else if (demo) {
    try {
      game.demoOrbit = true;
      setPlayerPos(game, 0, -20);
    } catch (e) {
      log('demo failed: ' + e.message);
    }
    writeDiag({ mode: 'demo', log: LOG });
  }
}
