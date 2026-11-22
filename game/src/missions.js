// Solmar Bay — the story. Fourteen missions, played in order, each with stages,
// dialogue, a beacon marking the target, timers, and a cash reward. Dana
// Reyes is back in Solmar Bay with $250 and a debt to Marlow, and works it
// off one job at a time.

import { dist2 } from './util.js';

const DIALOGUE_TIME = 5; // seconds before a line advances on its own

export class Missions {
  constructor(game) {
    this.game = game;
    this.THREE = game.THREE;
    this.scene = game.scene;
    this.state = 'idle'; // idle | active | done
    this.idx = 0;
    this.stage = 0;
    this.timeLeft = 0;
    this.holdProgress = 0;
    this.dialogue = [];
    this.dialogueIdx = 0;
    this.dialogueTimer = 0;
    this.starterCar = null;
    this.caseMesh = null;
    this._buildBeacon();
    this.defs = this._defs();
  }

  _buildBeacon() {
    const mat = new this.THREE.MeshBasicMaterial({
      color: 0xffd21f,
      transparent: true,
      opacity: 0.28,
      side: this.THREE.DoubleSide,
      depthWrite: false,
    });
    this.beacon = new this.THREE.Mesh(new this.THREE.CylinderGeometry(3, 3, 42, 20, 1, true), mat);
    this.beacon.visible = false;
    this.scene.add(this.beacon);
    const ring = new this.THREE.Mesh(
      new this.THREE.RingGeometry(2.4, 3.4, 32),
      new this.THREE.MeshBasicMaterial({ color: 0xffd21f, transparent: true, opacity: 0.8, side: this.THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    this.beaconRing = ring;
    ring.visible = false;
    this.scene.add(ring);
    // The briefcase for the final mission.
    this.caseMesh = new this.THREE.Mesh(
      new this.THREE.BoxGeometry(1.1, 0.8, 0.35),
      new this.THREE.MeshLambertMaterial({ color: 0xd8a020, emissive: 0x6a4a00 }),
    );
    this.caseMesh.visible = false;
    this.scene.add(this.caseMesh);
  }

  _defs() {
    const L = this.game.city.landmarks;
    return [
      {
        name: 'Fresh Start',
        intro: [
          { name: 'Marlow', text: 'Dana Reyes. Back in Solmar Bay after five years, and you still owe me $250.' },
          { name: 'Dana', text: 'I just got here, Marlow. Give me a day.' },
          { name: 'Marlow', text: "A day? Fine. But you work it off. Come to my garage first — then take my old sedan to the paint shop." },
        ],
        stages: [
          { type: 'goto', target: L.garage, radius: 7, text: 'Go to Marlow\u2019s garage' },
          { type: 'enterCar', target: L.garage, radius: 9, text: 'Get in Marlow\u2019s car (press E)' },
          { type: 'deliver', target: L.paintShop, radius: 9, text: 'Deliver the sedan to the paint shop' },
        ],
        reward: 150,
      },
      {
        name: 'Hot Wheels',
        intro: [
          { name: 'Marlow', text: 'A client wants a Comet GT — red, parked near the east blocks. Bring it here. No questions.' },
          { name: 'Dana', text: 'That is stealing, Marlow.' },
          { name: 'Marlow', text: 'That is business.' },
        ],
        stages: [
          { type: 'goto', target: { x: 86, z: -96 }, radius: 8, text: 'Find the red Comet GT' },
          { type: 'steal', target: { x: 86, z: -96 }, radius: 6, text: 'Steal the Comet GT (press E)' },
          { type: 'deliver', target: L.garage, radius: 9, time: 120, text: 'Deliver the Comet GT to the garage' },
        ],
        reward: 400,
      },
      {
        name: 'Courier Run',
        intro: [
          { name: 'Marlow', text: 'Three packages, three stops. Mall, hospital, docks. 150 seconds. The buyers do not wait.' },
        ],
        stages: [
          { type: 'deliver', target: L.mall, radius: 8, time: 150, text: 'Drop 1 of 3: the mall' },
          { type: 'deliver', target: L.hospital, radius: 8, text: 'Drop 2 of 3: the hospital' },
          { type: 'deliver', target: L.docks, radius: 8, text: 'Drop 3 of 3: the docks' },
        ],
        reward: 600,
      },
      {
        name: 'Dockside Trouble',
        intro: [
          { name: 'Marlow', text: 'The Vultures are shaking down my docks. Go remind them who runs this town.' },
        ],
        stages: [
          { type: 'goto', target: L.docks, radius: 12, text: 'Go to the docks' },
          { type: 'kill', target: L.docks, radius: 20, text: 'Take out the Vultures' },
          { type: 'goto', target: L.garage, radius: 8, text: 'Report back to Marlow' },
        ],
        reward: 800,
      },
      {
        name: 'The Getaway',
        intro: [
          { name: 'Marlow', text: 'The bank vault. Five seconds on the drill and we are rich. The cops will come — drive fast.' },
        ],
        stages: [
          { type: 'goto', target: L.bank, radius: 10, text: 'Go to Solmar Bank' },
          { type: 'hold', target: L.bank, radius: 12, text: 'Crack the vault (hold E)' },
          { type: 'escape', target: L.safehouse, radius: 9, time: 180, text: 'Escape to the safehouse' },
        ],
        reward: 1000,
      },
      {
        name: 'Neon Street Race',
        intro: [
          { name: 'Vex', text: 'Dana Reyes. The Sunset Circuit runs tonight — pier, docks, garage. Loser pays for the paint.' },
          { name: 'Dana', text: 'You talk too much, Vex. Line up.' },
          { name: 'Mira', text: 'I swapped your plates already. Win it, and the whole bay hears your name.' },
        ],
        stages: [
          { type: 'deliver', target: L.pier, radius: 10, time: 90, text: 'Checkpoint 1/3: the pier' },
          { type: 'deliver', target: L.docks, radius: 10, time: 75, text: 'Checkpoint 2/3: the docks' },
          { type: 'deliver', target: L.garage, radius: 9, time: 75, text: 'Checkpoint 3/3: Marlow\u2019s garage' },
        ],
        reward: 1200,
      },
      {
        name: 'The Collector',
        intro: [
          { name: 'Marlow', text: 'A collector at the docks owns a Solstice S — silver, one of a kind. He will not miss it till morning.' },
          { name: 'Dana', text: 'Steal a collector car from the docks. Sure. What could go wrong?' },
        ],
        stages: [
          { type: 'goto', target: L.docks, radius: 12, text: 'Go to the docks' },
          { type: 'steal', target: L.docks, radius: 8, text: 'Steal the silver Solstice S (press E)' },
          { type: 'deliver', target: L.garage, radius: 9, time: 120, text: 'Deliver the Solstice S to the garage' },
        ],
        reward: 1500,
      },
      {
        name: 'Vulture War',
        intro: [
          { name: 'Marlow', text: 'The Vultures came back twice as mean. They hold the mall and the hospital block. Take both back.' },
          { name: 'Mira', text: 'I will watch the exits. Do not let them circle you, Dana.' },
        ],
        stages: [
          { type: 'goto', target: L.mall, radius: 12, text: 'Go to Solmar Mall' },
          { type: 'kill', target: L.mall, radius: 22, text: 'Clear the mall crew' },
          { type: 'kill', target: L.hospital, radius: 22, text: 'Clear the hospital block crew' },
          { type: 'goto', target: L.garage, radius: 8, text: 'Report back to Marlow' },
        ],
        reward: 1800,
      },
      {
        name: 'Harbor Heat',
        intro: [
          { name: 'Marlow', text: 'The bank crew is a trap — Vultures inside, cops outside. Fight through, then vanish to the safehouse.' },
          { name: 'Dana', text: 'A trap I walk into on purpose. This city never changes.' },
        ],
        stages: [
          { type: 'goto', target: L.bank, radius: 10, text: 'Go to Solmar Bank' },
          { type: 'kill', target: L.bank, radius: 22, text: 'Fight through the bank crew' },
          { type: 'escape', target: L.safehouse, radius: 9, time: 180, text: 'Escape to the safehouse — lose the heat' },
        ],
        reward: 2200,
      },
      {
        name: 'The Big Score',
        intro: [
          { name: 'Marlow', text: 'One last job, Dana. The case is at the airfield. The whole city is going to want it. Make it to the pier and we are done.' },
        ],
        stages: [
          { type: 'goto', target: L.airfield, radius: 14, text: 'Go to the airfield' },
          { type: 'kill', target: L.airfield, radius: 24, text: 'Clear the airfield crew' },
          { type: 'grab', target: L.airfield, radius: 5, text: 'Grab the case (press E)' },
          { type: 'escape', target: L.pier, radius: 9, text: 'Escape to the pier' },
        ],
        reward: 5000,
      },
      {
        name: 'Night Shift',
        intro: [
          { name: 'Mira', text: 'Dana, the Vultures are gathering at the airfield again. Trucks, guns — a whole convoy. They are planning something big.' },
          { name: 'Dana', text: 'Then I go take a look. Quietly.' },
          { name: 'Mira', text: 'Quietly, then loud if you have to. Bring me proof — papers, a plate, anything. Marlow needs to know what they are moving.' },
          { name: 'Marlow', text: 'And Dana — if that convoy rolls out tonight, it rolls over us. Stop it.' },
        ],
        stages: [
          { type: 'goto', target: L.airfield, radius: 14, text: 'Reach the airfield — scout the Vultures' },
          { type: 'kill', target: L.airfield, radius: 24, text: 'Stop the Vulture convoy' },
          { type: 'deliver', target: L.safehouse, radius: 9, text: 'Bring the evidence to the safehouse' },
        ],
        reward: 2600,
      },
      {
        name: 'The Last Ferry',
        intro: [
          { name: 'Marlow', text: 'This is it, Dana. The last of the Vultures are dug in at the pier. We end this tonight, together.' },
          { name: 'Mira', text: 'I will cover the pier road. You take the head of the pier — and do not stop till the last one drops.' },
          { name: 'Dana', text: 'Five years I ran from this city. Tonight I take it back. When the pier is clear, we catch the last ferry out.' },
          { name: 'Marlow', text: 'Your debt is paid in full after this, Dana. Whatever happens — it was an honor.' },
        ],
        stages: [
          { type: 'goto', target: L.pier, radius: 12, text: 'Get to the pier' },
          { type: 'kill', target: L.pier, radius: 24, text: 'Hold the pier — clear the last Vultures' },
          { type: 'escape', target: L.docks, radius: 9, time: 180, text: 'Board the ferry at the docks — leave Solmar Bay' },
        ],
        reward: 6000,
      },
      {
        name: 'One Last Job',
        intro: [
          { name: 'Marlow', text: 'Dana — hold the ferry. The Vultures\u2019 boss is still free, and he is loading his last stash at the harbour. One more score, then the bay is really yours.' },
          { name: 'Dana', text: 'Marlow, I was already on the boat. You want me to step off for one more fight?' },
          { name: 'Marlow', text: 'I want you to finish it. The stash is at the docks — take it, bring it to my garage, and no one ever comes for us again.' },
          { name: 'Mira', text: 'I will watch the harbour road. Go — before his trucks roll out.' },
        ],
        stages: [
          { type: 'goto', target: L.docks, radius: 12, text: 'Reach the harbour — find the Vulture stash' },
          { type: 'kill', target: L.docks, radius: 24, text: 'Clear the harbour crew' },
          { type: 'deliver', target: L.garage, radius: 9, time: 150, text: 'Drive the stash to Marlow\u2019s garage' },
        ],
        reward: 8000,
      },
      {
        name: 'Harbour Lights',
        intro: [
          { name: 'Mira', text: 'Sun is setting over the harbour, Dana. The last Vultures are dug in at the pier — and their boss is with them this time.' },
          { name: 'Dana', text: 'Then tonight it ends. No more running, no more debt. If I walk off that pier, I walk off as the one who runs this bay.' },
          { name: 'Marlow', text: 'You already run it, Dana. You just have to make them say it. I will be at the garage, listening for the quiet.' },
          { name: 'Vex', text: 'Heard you were leaving, Reyes. Stay and fight, and the whole bay will remember your name — win or lose.' },
        ],
        stages: [
          { type: 'goto', target: L.pier, radius: 12, text: 'Get to the pier at sunset' },
          { type: 'kill', target: L.pier, radius: 24, text: 'Hold the pier — the final Vultures' },
          { type: 'goto', target: { x: 0, z: 342 }, radius: 6, text: 'Stand at the end of the pier — claim Solmar Bay' },
        ],
        reward: 10000,
      },
    ];
  }

  current() {
    return this.defs[this.idx];
  }

  currentStage() {
    const m = this.current();
    return m ? m.stages[this.stage] : null;
  }

  startMission(i) {
    this.idx = i;
    this.stage = 0;
    this.state = 'active';
    this.holdProgress = 0;
    this.game.combat.clearEnemies();
    this.caseMesh.visible = false;
    const m = this.current();
    this._say(m.intro);
    this._beginStage();
  }

  start() {
    this.startMission(this.idx);
  }

  _say(lines) {
    this.dialogue = lines;
    this.dialogueIdx = 0;
    this.dialogueTimer = 0;
    if (lines.length > 0) {
      this.game.hud.showDialogue(lines[0].name, lines[0].text);
      if (this.game.audio) this.game.audio.blip();
    }
  }

  _beginStage() {
    const st = this.currentStage();
    if (!st) return;
    this.timeLeft = st.time || 0;
    this.holdProgress = 0;
    // Stage-specific setup.
    if (this.idx === 0 && this.stage === 1 && !this.starterCar) {
      const g = this.game.city.landmarks.garage;
      this.starterCar = this.game.player.spawnStarterCar(g.x + 10, g.z + 14, Math.PI / 2);
    }
    if (this.idx === 3 && this.stage === 1) {
      const d = this.game.city.landmarks.docks;
      const spots = [[-14, -6], [10, 4], [-4, 12], [14, -12]];
      for (const [dx, dz] of spots) this.game.combat.spawnEnemy(d.x + dx, d.z + dz);
    }
    if (this.idx === 7 && this.stage === 1) {
      const m = this.game.city.landmarks.mall;
      const spots = [[-14, -6], [10, 4], [-4, 12], [14, -12], [0, -16]];
      for (const [dx, dz] of spots) this.game.combat.spawnEnemy(m.x + dx, m.z + dz);
    }
    if (this.idx === 7 && this.stage === 2) {
      const h = this.game.city.landmarks.hospital;
      const spots = [[-12, -8], [12, 6], [-6, 14], [16, -10]];
      for (const [dx, dz] of spots) this.game.combat.spawnEnemy(h.x + dx, h.z + dz);
    }
    if (this.idx === 8 && this.stage === 1) {
      const b = this.game.city.landmarks.bank;
      const spots = [[-12, -8], [12, 6], [-6, 14], [16, -10], [0, 18]];
      for (const [dx, dz] of spots) this.game.combat.spawnEnemy(b.x + dx, b.z + dz);
    }
    if (this.idx === 9 && this.stage === 1) {
      const a = this.game.city.landmarks.airfield;
      const spots = [[-30, -8], [30, 6], [-10, 14], [18, -16], [-34, 10], [34, -4]];
      for (const [dx, dz] of spots) this.game.combat.spawnEnemy(a.x + dx, a.z + dz);
    }
    if (this.idx === 9 && this.stage === 2) {
      const a = this.game.city.landmarks.airfield;
      this.caseMesh.position.set(a.x, 1.0, a.z + 4);
      this.caseMesh.visible = true;
    }
    if (this.idx === 10 && this.stage === 1) {
      const a = this.game.city.landmarks.airfield;
      const spots = [[-30, -8], [30, 6], [-10, 14], [18, -16], [-34, 10], [34, -4]];
      for (const [dx, dz] of spots) this.game.combat.spawnEnemy(a.x + dx, a.z + dz);
    }
    if (this.idx === 11 && this.stage === 1) {
      const p = this.game.city.landmarks.pier;
      const spots = [[-4, -12], [5, -6], [-5, 6], [4, 12], [0, -18], [6, 18]];
      for (const [dx, dz] of spots) this.game.combat.spawnEnemy(p.x + dx, p.z + dz);
    }
    if (this.idx === 11 && this.stage === 2) {
      // Epilogue: the arc closes as Dana runs for the last ferry.
      this._say([
        { name: 'Mira', text: 'Pier is clear! The ferry is waiting at the docks — go, Dana, GO!' },
        { name: 'Dana', text: 'It is over. The Vultures are done — and so is my debt.' },
        { name: 'Marlow', text: 'Solmar Bay is yours now, Dana Reyes. Do not look back.' },
        { name: 'Dana', text: 'I will not. Next stop — anywhere but here. Thank you, both of you.' },
      ]);
    }
    if (this.idx === 12 && this.stage === 1) {
      const d = this.game.city.landmarks.docks;
      const spots = [[-16, -4], [8, 8], [-6, 14], [12, -10], [2, -14]];
      for (const [dx, dz] of spots) this.game.combat.spawnEnemy(d.x + dx, d.z + dz);
    }
    if (this.idx === 13 && this.stage === 1) {
      const p = this.game.city.landmarks.pier;
      const spots = [[-5, -14], [6, -8], [-6, 4], [5, 10], [-2, 16], [6, -18], [-6, -2]];
      for (const [dx, dz] of spots) this.game.combat.spawnEnemy(p.x + dx, p.z + dz);
    }
    if (this.idx === 13 && this.stage === 2) {
      // Epilogue: Dana stays. The ferry leaves without her — Solmar Bay has a new ruler.
      this._say([
        { name: 'Dana', text: 'It is done. The harbour lights are mine now — every one of them.' },
        { name: 'Mira', text: 'The whole bay just went quiet, Dana. They heard you.' },
        { name: 'Marlow', text: 'Solmar Bay is yours, Dana Reyes. Not borrowed. Not owed. Yours.' },
        { name: 'Dana', text: 'Then I am staying. No ferry, no running. This city is home now — and I rule it.' },
      ]);
    }
    const t = st.target;
    if (t) {
      this.beacon.position.set(t.x, 21, t.z);
      this.beaconRing.position.set(t.x, 0.15, t.z);
      this.beacon.visible = true;
      this.beaconRing.visible = true;
    } else {
      this.beacon.visible = false;
      this.beaconRing.visible = false;
    }
  }

  _advanceStage() {
    this.stage++;
    const m = this.current();
    if (this.stage >= m.stages.length) {
      this._completeMission();
    } else {
      this._beginStage();
    }
  }

  _completeMission() {
    const m = this.current();
    this.game.player.cash += m.reward;
    // Respect: each job builds Dana's name in the bay; rank-ups toast.
    const repGain = 50 + this.idx * 15;
    if (this.game.progress) {
      const leveled = this.game.progress.addRep(repGain);
      if (leveled) {
        this.game.hud.toast('RANK UP — you are now ' + this.game.progress.rank().name + '  (+' + repGain + ' REP)');
      }
    }
    this.game.hud.toast('Mission complete: ' + m.name + '  +$' + m.reward.toLocaleString('en-US') + '  +' + repGain + ' REP');
    if (this.game.audio) this.game.audio.cash();
    this.beacon.visible = false;
    this.beaconRing.visible = false;
    this.caseMesh.visible = false;
    this.idx++;
    if (this.idx >= this.defs.length) {
      this.state = 'done';
      this.game.hud.showOverlay('complete');
      this.game.onStoryComplete();
    } else {
      this.startMission(this.idx);
    }
    this.game.saveNow();
  }

  _failMission(reason) {
    this.game.hud.toast('Mission failed: ' + reason + ' — try again');
    this.game.police.clear();
    this.startMission(this.idx);
  }

  // HUD reads this every frame.
  objective() {
    if (this.state !== 'active') {
      return this.state === 'done'
        ? { text: 'Free roam — Solmar Bay is yours', target: null }
        : { text: 'Press Start to begin the story', target: null };
    }
    const st = this.currentStage();
    let text = this.current().name + ': ' + st.text;
    if (st.type === 'kill') {
      const left = this.game.combat.livingEnemies().length;
      text += '  (' + left + ' left)';
    }
    if (st.type === 'hold' && this.holdProgress > 0) {
      text += '  ' + Math.ceil(this.holdProgress) + 's / 5s';
    }
    if (this.timeLeft > 0) {
      text += '  [' + Math.ceil(this.timeLeft) + 's]';
    }
    return { text, target: st.target || null };
  }

  update(dt) {
    if (this.state !== 'active') return;
    const game = this.game;
    const input = game.input;
    const player = game.player;
    // Dialogue first: E advances, or it advances on its own.
    if (this.dialogueIdx < this.dialogue.length) {
      this.dialogueTimer += dt;
      // _holdDialogue (screenshot staging) freezes auto-advance; E still works.
      if (input.wasPressed('KeyE') || (!game._holdDialogue && this.dialogueTimer > DIALOGUE_TIME)) {
        this.dialogueIdx++;
        this.dialogueTimer = 0;
        if (this.dialogueIdx < this.dialogue.length) {
          const line = this.dialogue[this.dialogueIdx];
          game.hud.showDialogue(line.name, line.text);
          if (game.audio) game.audio.blip();
        } else {
          game.hud.hideDialogue();
        }
      }
      return; // stages wait while anyone is talking
    }
    const st = this.currentStage();
    if (!st) return;
    if (this.timeLeft > 0) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this._failMission('out of time');
        return;
      }
    }
    const pp = player.getPos();
    const target = st.target;
    switch (st.type) {
      case 'goto':
      case 'deliver':
      case 'escape': {
        if (target && dist2(pp.x, pp.z, target.x, target.z) < st.radius) {
          if (st.type === 'escape') game.police.clear();
          this._advanceStage();
        }
        break;
      }
      case 'enterCar': {
        if (player.mode === 'car') this._advanceStage();
        break;
      }
      case 'steal': {
        // Steal the nearest sport car within reach (the mission target is
        // the one parked at the stage location, e.g. the Solstice S).
        let sport = null;
        let bestD = 6;
        for (const p of game.traffic.parked) {
          if (!p.sport || p.taken) continue;
          const dd = dist2(pp.x, pp.z, p.pos.x, p.pos.z);
          if (dd < bestD) {
            bestD = dd;
            sport = p;
          }
        }
        if (sport && input.wasPressed('KeyE')) {
          player.enterCar(sport);
          game.police.addHeat(25);
          game.hud.toast('Stolen! The cops are coming.');
          this._advanceStage();
        }
        break;
      }
      case 'kill': {
        if (game.combat.allDead()) this._advanceStage();
        break;
      }
      case 'hold': {
        const near = target && dist2(pp.x, pp.z, target.x, target.z) < st.radius;
        if (near && input.isDown('KeyE')) {
          this.holdProgress += dt;
          if (this.holdProgress >= 5) {
            player.cash += 1500;
            game.police.addHeat(95);
            game.hud.toast('Vault cracked! +$1,500 — run!');
            if (game.audio) game.audio.explosion();
            this._advanceStage();
          }
        } else {
          this.holdProgress = Math.max(0, this.holdProgress - dt * 2);
        }
        break;
      }
      case 'grab': {
        const a = game.city.landmarks.airfield;
        if (dist2(pp.x, pp.z, a.x, a.z + 4) < 4 && input.wasPressed('KeyE')) {
          this.caseMesh.visible = false;
          game.police.addHeat(190);
          game.hud.toast('Case grabbed! Every cop in the city is coming.');
          this._advanceStage();
        }
        break;
      }
      default:
        break;
    }
    // Beacon pulse.
    const pulse = 0.22 + 0.1 * Math.sin(performance.now() * 0.004);
    this.beacon.material.opacity = pulse;
  }
}
