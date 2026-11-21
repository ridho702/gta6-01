// Solmar Bay — the HUD: health and cash, clock and wanted stars, the
// objective line with distance, a circular minimap, the speedometer, the
// dialogue box, toast messages, and the menu overlays. All DOM; the game
// writes state into it once per frame.

import { formatCash, formatClock, dist2 } from './util.js';
import { WEAPONS, districtAt } from './progress.js';

export class HUD {
  constructor() {
    this.el = (id) => document.getElementById(id);
    this.healthFill = this.el('hud-health-fill');
    this.cashEl = this.el('hud-cash');
    this.ammoEl = this.el('hud-ammo');
    this.clockEl = this.el('hud-clock');
    this.starsEl = this.el('hud-stars');
    this.objectiveEl = this.el('hud-objective');
    this.distEl = this.el('hud-dist');
    this.speedEl = this.el('hud-speed');
    this.dialogueEl = this.el('hud-dialogue');
    this.dialogueName = this.el('hud-dialogue-name');
    this.dialogueText = this.el('hud-dialogue-text');
    this.toastEl = this.el('hud-toast');
    this.minimap = this.el('hud-minimap');
    this.mapCtx = this.minimap ? this.minimap.getContext('2d') : null;
    this._toastTimer = null;
    // Weapon slots are built once; update() only refreshes their state.
    this._weaponEls = {};
    const wbox = this.el('hud-weapons');
    if (wbox) {
      for (const w of WEAPONS) {
        const row = document.createElement('div');
        row.className = 'hud-weapon';
        wbox.appendChild(row);
        this._weaponEls[w.id] = row;
      }
    }
    this._portrait = this.el('hud-portrait');
  }

  update(game) {
    const player = game.player;
    const p = game.progress;
    const pp = player.getPos();
    if (this.healthFill) {
      this.healthFill.style.width = Math.max(0, player.health) + '%';
      this.healthFill.style.background = player.health > 50 ? '#4caf50' : player.health > 25 ? '#ff9800' : '#f44336';
    }
    if (this.cashEl) this.cashEl.textContent = formatCash(player.cash);
    if (this.clockEl) this.clockEl.textContent = formatClock(game.clockMinutes);
    if (this.starsEl) {
      const w = game.police.wanted;
      this.starsEl.textContent = '★'.repeat(w) + '☆'.repeat(5 - w);
      this.starsEl.classList.toggle('hot', w > 0);
    }
    // ---- mission panel (left-top) ----
    const mTitle = this.el('hud-mission-title');
    if (mTitle) {
      if (game.missions.state === 'active') {
        const m = game.missions.current();
        const st = game.missions.currentStage();
        mTitle.textContent = 'MISSION ' + (game.missions.idx + 1) + '/10 — ' + m.name.toUpperCase();
        const stageEl = this.el('hud-mission-stage');
        if (stageEl) stageEl.textContent = 'STAGE ' + (game.missions.stage + 1) + '/' + m.stages.length + ' — ' + st.text;
        const fill = this.el('hud-mission-fill');
        if (fill) fill.style.width = Math.round(((game.missions.stage + 1) / m.stages.length) * 100) + '%';
        const timerEl = this.el('hud-mission-timer');
        if (timerEl) {
          timerEl.textContent = game.missions.timeLeft > 0 ? '⏱ ' + Math.ceil(game.missions.timeLeft) + 's LEFT' : '';
        }
      } else if (game.missions.state === 'done') {
        mTitle.textContent = 'STORY COMPLETE — FREE ROAM';
        const stageEl = this.el('hud-mission-stage');
        if (stageEl) stageEl.textContent = 'Solmar Bay is yours. Keep the rank climbing.';
        const fill = this.el('hud-mission-fill');
        if (fill) fill.style.width = '100%';
      } else {
        mTitle.textContent = 'MISSION 1/10 — FRESH START';
        const stageEl = this.el('hud-mission-stage');
        if (stageEl) stageEl.textContent = 'Press Start to begin the story';
      }
    }
    // ---- SBPD dispatch panel (left, while wanted) ----
    const disp = this.el('hud-dispatch');
    if (disp) {
      const w = game.police.wanted;
      if (w >= 1) {
        disp.style.display = 'block';
        const list = this.el('hud-dispatch-list');
        if (list) {
          let html = '';
          for (const car of game.police.cars) {
            const d = Math.round(dist2(pp.x, pp.z, car.pos.x, car.pos.z));
            html += '<div>' + (car.unitName || 'SBPD Unit') + ' · ' + (car.unitRole || 'PURSUE') + ' · ' + d + 'm</div>';
          }
          if (game.airUnit && game.airUnit.active) {
            html += '<div class="disp-heli">AIR-1 · SPOTLIGHT · tracking you</div>';
          }
          if (game.roadblocks && game.roadblocks.blocks.length > 0) {
            html += '<div class="disp-block">ROADBLOCK · ' + game.roadblocks.blocks.length + ' set up ahead</div>';
          }
          if (!html) html = '<div>Units en route…</div>';
          list.innerHTML = html;
        }
      } else {
        disp.style.display = 'none';
      }
    }
    // ---- weapon slots + ammo (right-top) ----
    if (p) {
      for (const w of WEAPONS) {
        const row = this._weaponEls[w.id];
        if (!row) continue;
        const owned = p.owned[w.id];
        const active = p.weapon === w.id;
        row.className = 'hud-weapon' + (active ? ' active' : '') + (owned ? '' : ' locked');
        const ammoTxt = w.id === 'fists' ? '∞' : owned ? String(p.ammo[w.id]) : 'LOCKED $' + w.price;
        row.textContent = '[' + w.slot + '] ' + w.name + '  ·  ' + ammoTxt;
      }
      if (this.ammoEl) {
        const w = p.currentWeapon();
        this.ammoEl.textContent = w.id === 'fists' ? 'Fists ready' : 'Ammo ' + p.ammo[w.id] + ' (' + w.name + ')';
      }
      // ---- rank / respect bar ----
      const rankName = this.el('hud-rank-name');
      if (rankName) rankName.textContent = p.rank().name;
      const rankFill = this.el('hud-rank-fill');
      if (rankFill) rankFill.style.width = Math.round(p.repProgress() * 100) + '%';
      const rankRep = this.el('hud-rank-rep');
      if (rankRep) {
        const next = p.nextRank();
        rankRep.textContent = next ? 'REP ' + p.rep + ' / ' + next.rep + ' → ' + next.name : 'REP ' + p.rep + ' — MAX RANK';
      }
      // ---- Mira crew chip ----
      const crew = this.el('hud-crew');
      if (crew) {
        if (p.crewReady()) {
          crew.textContent = 'MIRA [Z] SWAP PLATES — READY';
          crew.classList.remove('cooling');
        } else {
          crew.textContent = 'MIRA [Z] SWAP PLATES — ' + Math.ceil(p.crewCooldown) + 's';
          crew.classList.add('cooling');
        }
      }
      // ---- radio strip ----
      const radio = this.el('hud-radio');
      if (radio) radio.textContent = '♪ ' + p.stationNow().name + ' — ' + p.songNow();
    }
    // ---- car panel (right-bottom) ----
    const carPanel = this.el('hud-car');
    if (carPanel) {
      if (player.mode === 'car' && player.car) {
        carPanel.style.display = 'block';
        const nameEl = this.el('hud-car-name');
        if (nameEl) nameEl.textContent = player.car.name || 'Meridian LX';
        const condEl = this.el('hud-car-cond');
        if (condEl) {
          const cond = Math.round(player.car.condition ?? 100);
          condEl.textContent = 'CONDITION ' + cond + '%' + (player.car.smoking ? ' — SMOKING!' : '');
          condEl.classList.toggle('bad', cond < 35);
        }
        const gearEl = this.el('hud-car-gear');
        if (gearEl) {
          const kmh = Math.abs(player.carSpeed || 0) * 3.6;
          const gear = (player.carSpeed || 0) < -0.5 ? 'R' : kmh < 1 ? 'N' : kmh < 30 ? '1' : kmh < 60 ? '2' : kmh < 90 ? '3' : kmh < 120 ? '4' : '5';
          gearEl.textContent = 'GEAR ' + gear + ' · TUNE ' + (p ? p.tune : 0) + '/3' + (p && p.armor > 0 ? ' · ARMOR ' + Math.round(p.armor) : '');
        }
      } else {
        carPanel.style.display = 'none';
      }
    }
    // ---- district label (left-bottom) ----
    const dist = this.el('hud-district');
    if (dist) dist.textContent = districtAt(pp.x, pp.z);
    // ---- shop hint ----
    const hint = this.el('hud-shophint');
    if (hint) hint.textContent = game.shops ? game.shops.hint(pp) : '';
    // ---- alert banner ----
    const alertEl = this.el('hud-alert');
    if (alertEl) {
      let msg = '';
      let warn = false;
      const heading = player.mode === 'car' && player.car ? player.car.angle : player.angle;
      const rb = game.roadblocks ? game.roadblocks.ahead(pp, heading, 90) : 0;
      if (rb > 0) {
        msg = '⚠ ROADBLOCK AHEAD — ' + rb + 'm';
        warn = true;
      } else if (game.airUnit && game.airUnit.active) {
        msg = '✦ AIR-1 OVERHEAD — IN SIGHT';
      } else if (game.police.wanted >= 1) {
        msg = '★ WANTED — SBPD IN PURSUIT';
      }
      if (msg) {
        alertEl.style.display = 'block';
        alertEl.textContent = msg;
        alertEl.classList.toggle('warn', warn);
      } else {
        alertEl.style.display = 'none';
      }
    }
    const obj = game.missions.objective();
    if (this.objectiveEl) this.objectiveEl.textContent = obj.text;
    if (this.distEl) {
      if (obj.target) {
        this.distEl.textContent = Math.round(dist2(pp.x, pp.z, obj.target.x, obj.target.z)) + 'm';
      } else {
        this.distEl.textContent = '';
      }
    }
    if (this.speedEl) {
      if (player.mode === 'car') {
        this.speedEl.style.display = 'block';
        this.speedEl.textContent = Math.round(Math.abs(player.carSpeed || 0) * 3.6) + ' km/h';
      } else {
        this.speedEl.style.display = 'none';
      }
    }
    this._drawMinimap(game, obj);
  }

  // Canvas-drawn speaker portrait for the dialogue box: a simple bust
  // (skin, hair, signature colour) so each speaker reads at a glance.
  _drawPortrait(name) {
    const cv = this._portrait;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const look = {
      Marlow: { skin: '#d8a878', hair: '#c8c8c8', shirt: '#4a5a6a', extra: 'cap' },
      Dana: { skin: '#e8b88a', hair: '#2a1a10', shirt: '#3a7ac0', extra: 'cap' },
      Mira: { skin: '#e8c0a0', hair: '#7a3ab0', shirt: '#2a2a3a', extra: 'band' },
      Vex: { skin: '#c98a5a', hair: '#101010', shirt: '#5a1a1a', extra: 'band' },
    }[name] || { skin: '#e8b88a', hair: '#3a2a1a', shirt: '#3a7ac0', extra: '' };
    ctx.clearRect(0, 0, 72, 72);
    ctx.fillStyle = '#24303e';
    ctx.fillRect(0, 0, 72, 72);
    // Shoulders / shirt.
    ctx.fillStyle = look.shirt;
    ctx.beginPath();
    ctx.moveTo(8, 72);
    ctx.quadraticCurveTo(36, 44, 64, 72);
    ctx.closePath();
    ctx.fill();
    // Head.
    ctx.fillStyle = look.skin;
    ctx.beginPath();
    ctx.arc(36, 30, 17, 0, Math.PI * 2);
    ctx.fill();
    // Hair.
    ctx.fillStyle = look.hair;
    ctx.beginPath();
    ctx.arc(36, 26, 17, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(19, 24, 34, 6);
    if (look.extra === 'cap') {
      ctx.fillStyle = '#c02020';
      ctx.fillRect(19, 12, 34, 8);
      ctx.fillRect(36, 18, 20, 4);
    } else if (look.extra === 'band') {
      ctx.fillStyle = name === 'Mira' ? '#c9a0ff' : '#d02020';
      ctx.fillRect(19, 20, 34, 5);
    }
    // Eyes.
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(27, 30, 4, 4);
    ctx.fillRect(41, 30, 4, 4);
    // Mouth.
    ctx.strokeStyle = '#7a4a30';
    ctx.beginPath();
    ctx.moveTo(31, 42);
    ctx.lineTo(41, 42);
    ctx.stroke();
  }

  _drawMinimap(game, obj) {
    const ctx = this.mapCtx;
    if (!ctx) return;
    const S = 180;
    const W = 700; // world span mapped onto the map
    const toX = (x) => ((x + W / 2) / W) * S;
    const toY = (z) => ((z + W / 2) / W) * S;
    ctx.clearRect(0, 0, S, S);
    // Round clip.
    ctx.save();
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(20, 24, 28, 0.85)';
    ctx.fillRect(0, 0, S, S);
    // Ocean (south) and beach.
    ctx.fillStyle = '#1d6fa8';
    ctx.fillRect(0, toY(300), S, S - toY(300));
    ctx.fillStyle = '#e6d3a3';
    ctx.fillRect(0, toY(262), S, toY(300) - toY(262));
    // Streets.
    ctx.strokeStyle = '#5a5a62';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 10; i++) {
      const c = -260 + i * 52;
      ctx.beginPath();
      ctx.moveTo(toX(c), toY(-260));
      ctx.lineTo(toX(c), toY(260));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(toX(-260), toY(c));
      ctx.lineTo(toX(260), toY(c));
      ctx.stroke();
    }
    // Landmarks.
    ctx.fillStyle = '#e8c832';
    for (const key of Object.keys(game.city.landmarks)) {
      const lm = game.city.landmarks[key];
      ctx.fillRect(toX(lm.x) - 2, toY(lm.z) - 2, 4, 4);
    }
    // Mission target.
    if (obj.target) {
      const x = toX(obj.target.x);
      const y = toY(obj.target.z);
      ctx.fillStyle = '#ffd21f';
      ctx.beginPath();
      ctx.moveTo(x, y - 6);
      ctx.lineTo(x + 5, y);
      ctx.lineTo(x, y + 6);
      ctx.lineTo(x - 5, y);
      ctx.closePath();
      ctx.fill();
    }
    // Traffic (white), police (red/blue), enemies (red).
    ctx.fillStyle = '#ffffff';
    for (const car of game.traffic.cars) {
      ctx.fillRect(toX(car.pos.x) - 1, toY(car.pos.z) - 1, 2, 2);
    }
    ctx.fillStyle = '#ff4040';
    for (const car of game.police.cars) {
      ctx.fillRect(toX(car.pos.x) - 2, toY(car.pos.z) - 2, 4, 4);
    }
    ctx.fillStyle = '#4080ff';
    for (const cop of game.police.cops) {
      ctx.fillRect(toX(cop.pos.x) - 2, toY(cop.pos.z) - 2, 4, 4);
    }
    ctx.fillStyle = '#ff2020';
    for (const e of game.combat.livingEnemies()) {
      ctx.beginPath();
      ctx.arc(toX(e.pos.x), toY(e.pos.z), 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Air-1 heli (yellow) and roadblock cruisers (orange).
    if (game.airUnit && game.airUnit.active) {
      ctx.fillStyle = '#ffe14d';
      ctx.beginPath();
      ctx.arc(toX(game.airUnit.group.position.x), toY(game.airUnit.group.position.z), 4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (game.roadblocks) {
      ctx.fillStyle = '#ff9a3d';
      for (const b of game.roadblocks.blocks) {
        for (const c of b.cars) {
          ctx.fillRect(toX(c.pos.x) - 2, toY(c.pos.z) - 2, 4, 4);
        }
      }
    }
    // Player arrow (rotates with facing).
    const pp = game.player.getPos();
    const px = toX(pp.x);
    const py = toY(pp.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(game.player.angle);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 5);
    ctx.lineTo(0, 2);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
    // Round border.
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2);
    ctx.stroke();
  }

  showDialogue(name, text) {
    if (!this.dialogueEl) return;
    this.dialogueEl.style.display = 'flex';
    this._drawPortrait(name);
    this.dialogueName.textContent = name;
    this.dialogueText.textContent = text + '  (E to continue)';
  }

  hideDialogue() {
    if (this.dialogueEl) this.dialogueEl.style.display = 'none';
  }

  toast(msg) {
    if (!this.toastEl) return;
    this.toastEl.textContent = msg;
    this.toastEl.style.display = 'block';
    if (this._toastTimer) window.clearTimeout(this._toastTimer);
    this._toastTimer = window.setTimeout(() => {
      this.toastEl.style.display = 'none';
    }, 4000);
  }

  showOverlay(name) {
    for (const id of ['screen-start', 'screen-pause', 'screen-wasted', 'screen-busted', 'screen-complete']) {
      const el = this.el(id);
      if (el) el.style.display = id === 'screen-' + name ? 'flex' : 'none';
    }
  }

  hideOverlays() {
    for (const id of ['screen-start', 'screen-pause', 'screen-wasted', 'screen-busted', 'screen-complete']) {
      const el = this.el(id);
      if (el) el.style.display = 'none';
    }
  }
}
