// Solmar Bay — story missions. Six jobs for Marlow's crew, each a chain of
// stages (go to, steal, deliver, fight, hold, escape) with dialogue and pay.
import { LANDMARKS } from './city.js';

export const MISSIONS = [
  {
    id: 'fresh-start', title: '1 · FRESH START', pay: 300,
    brief: 'Marlow is waiting at Marina Plaza. Go and hear him out.',
    dialogue: [
      ['MARLOW', "Dana Reyes. Back in Solmar Bay at last. You owe me, kid — but I like your style. Run a few jobs, we'll call it even."],
      ['DANA', 'One job at a time, old man. What have you got?'],
    ],
    stages: [
      { type: 'goto', target: LANDMARKS.plaza, label: 'Meet Marlow at Marina Plaza', radius: 8 },
    ],
  },
  {
    id: 'hot-wheels', title: '2 · HOT WHEELS', pay: 600,
    brief: 'A gold Comet Coupe is parked by Palms Mall. Steal it and bring it to the garage.',
    dialogue: [
      ['MARLOW', "A client wants a gold Comet Coupe. One is parked outside Palms Mall. Take it — quietly. Then bring it to my garage."],
    ],
    stages: [
      { type: 'steal', target: LANDMARKS.mall, label: 'Steal the gold Comet Coupe', radius: 6, carModel: 0 },
      { type: 'deliver', target: LANDMARKS.garage, label: 'Deliver the coupe to the garage', radius: 10, needCar: true },
    ],
  },
  {
    id: 'courier-run', title: '3 · COURIER RUN', pay: 800,
    brief: 'Pick up the package at the docks and deliver it to the airfield — fast. 150 seconds.',
    dialogue: [
      ['MARLOW', "Package at Fisherman Docks. Airfield buyer, cash on delivery. You've got 150 seconds — the buyer does not wait."],
    ],
    stages: [
      { type: 'goto', target: LANDMARKS.docks, label: 'Pick up the package at the docks', radius: 8 },
      { type: 'deliver', target: LANDMARKS.airport, label: 'Deliver the package to the airfield', radius: 10, time: 150 },
    ],
  },
  {
    id: 'dockside-trouble', title: '4 · DOCKSIDE TROUBLE', pay: 1200,
    brief: 'The Vultures jumped our crew at the docks. Clear them out.',
    dialogue: [
      ['MARLOW', 'The Vultures are muscling in on my docks. Four of them, armed. Go remind them whose pier this is.'],
      ['DANA', 'Loud and clear.'],
    ],
    stages: [
      { type: 'kill', target: LANDMARKS.docks, label: 'Take out the Vultures at the docks (0/4)', radius: 26, count: 4, spawnEnemies: 4 },
    ],
  },
  {
    id: 'the-getaway', title: '5 · THE GETAWAY', pay: 1500,
    brief: 'The Bay Police are onto the crew. Lose a 3-star wanted level, then reach the safehouse.',
    dialogue: [
      ['MARLOW', "Cops are crawling all over the crew, Dana. Make some noise, lose them, and get to the safehouse. Don't get caught."],
    ],
    stages: [
      { type: 'escape', target: LANDMARKS.safehouse, label: 'Reach 3 stars, then lose the police', radius: 10, wantStars: 3 },
    ],
  },
  {
    id: 'the-big-score', title: '6 · THE BIG SCORE', pay: 5000,
    brief: 'Rob Bay Trust Bank: hold E at the vault, then escape the 4-star heat to the pier boat.',
    dialogue: [
      ['MARLOW', "This is the one, Dana. Bay Trust Bank. Crack the vault, grab the cash, and don't stop till you hit the pier boat."],
      ['DANA', 'After this, we are even. All of it.'],
    ],
    stages: [
      { type: 'goto', target: LANDMARKS.bank, label: 'Get to Bay Trust Bank', radius: 10 },
      { type: 'hold', target: LANDMARKS.bank, label: 'Hold E to crack the vault', radius: 8, holdTime: 6 },
      { type: 'escape', target: LANDMARKS.pier, label: 'Escape to the pier boat — lose the heat', radius: 10, wantStars: 4 },
    ],
  },
];

export class MissionManager {
  constructor(game) {
    this.game = game;
    this.index = 0;
    this.stage = 0;
    this.active = false;
    this.stageTimer = 0;
    this.holdProgress = 0;
    this.kills = 0;
    this.enemiesSpawned = false;
    this.escaped = false;
  }
  get mission() { return MISSIONS[this.index]; }
  get stageDef() { return this.mission ? this.mission.stages[this.stage] : null; }
  get done() { return this.index >= MISSIONS.length; }
  start(index) {
    this.index = index; this.stage = 0; this.active = true;
    this.stageTimer = 0; this.holdProgress = 0; this.kills = 0; this.enemiesSpawned = false;
    this.escaped = false;
    const m = this.mission;
    this.game.dialogueQueue = [];
    this.game.showToast(m.title);
    this.game.sayLines(m.dialogue);
    this.game.sound.mission();
    this.game.hud.setObjective(m.stages[0].label, m.title);
  }
  startNext() {
    if (this.index + 1 >= MISSIONS.length) { this.active = false; this.game.storyComplete(); return; }
    this.start(this.index + 1);
  }
  currentTarget() {
    const s = this.stageDef;
    return s ? s.target : null;
  }
  // Called every frame; returns true when a stage just completed.
  update(dt, game) {
    if (!this.active || !this.mission) return;
    const s = this.stageDef;
    if (!s) return;
    const p = game.playerPos();
    const d = Math.hypot(p.x - s.target.x, p.z - s.target.z);
    if (s.type === 'kill' && !this.enemiesSpawned) {
      this.enemiesSpawned = true;
      game.spawnMissionEnemies(s.target, s.count);
    }
    if (s.type === 'escape') {
      if (!this.escaped && game.wanted.stars >= s.wantStars) {
        this.escaped = true;
        game.showToast('HEAT IS ON — LOSE THE POLICE');
        game.say([['MARLOW', 'Now lose them! Get out of sight and let the heat die down.']]);
      }
      if (this.escaped && game.wanted.stars === 0 && d < s.radius) this.completeStage(game);
      return;
    }
    if (s.type === 'hold') {
      if (d < s.radius && game.input.keys['KeyE']) {
        this.holdProgress += dt;
        game.hud.setObjective(`Cracking the vault… ${Math.ceil(s.holdTime - this.holdProgress)}s (hold E)`);
        if (this.holdProgress >= s.holdTime) {
          game.wanted.addHeat(4, 'Bank robbery!');
          this.completeStage(game);
        }
      } else {
        this.holdProgress = Math.max(0, this.holdProgress - dt * 0.5);
        game.hud.setObjective(s.label);
      }
      return;
    }
    if (s.type === 'steal') {
      if (game.missionCar && game.missionCar.stolen) { this.completeStage(game); return; }
      game.hud.setObjective(s.label);
      return;
    }
    if (s.type === 'deliver') {
      if (s.time) {
        this.stageTimer += dt;
        const left = Math.max(0, Math.ceil(s.time - this.stageTimer));
        game.hud.setObjective(`${s.label} — ${left}s left`);
        if (this.stageTimer > s.time) {
          game.showToast('TOO SLOW — JOB FAILED');
          game.say([['MARLOW', 'The buyer walked. We will try again — head back to the docks.']]);
          this.stage = 0; this.stageTimer = 0; this.enemiesSpawned = false;
          game.hud.setObjective(this.stageDef.label);
          return;
        }
      }
      if (d < s.radius && (!s.needCar || game.inCar)) this.completeStage(game);
      return;
    }
    // goto / kill (kill completes via kills counter)
    if (s.type === 'goto' && d < s.radius) this.completeStage(game);
    if (s.type === 'kill') {
      game.hud.setObjective(`Take out the Vultures at the docks (${this.kills}/${s.count})`);
      if (this.kills >= s.count) this.completeStage(game);
    }
  }
  onKill() {
    this.kills++;
    const s = this.stageDef;
    if (s && s.type === 'kill') this.game.hud.setObjective(`Take out the Vultures at the docks (${this.kills}/${s.count})`);
  }
  completeStage(game) {
    game.sound.cash();
    const m = this.mission;
    this.stage++;
    this.stageTimer = 0; this.holdProgress = 0;
    if (this.stage >= m.stages.length) {
      game.cash += m.pay;
      game.showToast(`JOB DONE — +$${m.pay}`);
      game.say([['MARLOW', `Clean work, Dana. $${m.pay} is yours. ${this.index + 1 < MISSIONS.length ? 'Next job is waiting.' : 'That was the last one — Solmar Bay is yours.'}`]]);
      game.saveGame();
      this.startNext();
    } else {
      game.hud.setObjective(m.stages[this.stage].label);
      game.showToast('OBJECTIVE UPDATED');
    }
  }
}
