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
    const wanted = game.police ? game.police.wanted : 0;

    if (this.healthFill) {
      this.healthFill.style.width = Math.max(0, player.health) + '%';
      this.healthFill.style.background = player.health > 50 ? '#4caf50' : player.health > 25 ? '#ff9800' : '#f44336';
    }
    if (this.cashEl) this.cashEl.textContent = formatCash(player.cash);
    if (this.clockEl) this.clockEl.textContent = formatClock(game.clockMinutes);
    if (this.starsEl) {
      this.starsEl.textContent = '★'.repeat(wanted) + '☆'.repeat(5 - wanted);
      this.starsEl.classList.toggle('hot', wanted > 0);
    }

    // Mission panel
    const mTitle = this.el('hud-mission-title');
    const stageEl = this.el('hud-mission-stage');
    const fill = this.el('hud-mission-fill');
    const timerEl = this.el('hud-mission-timer');
    if (game.missions) {
      if (game.missions.state === 'active') {
        const m = game.missions.current();
        const st = game.missions.currentStage();
        const idx = game.missions.idx ?? 0;
        const stage = game.missions.stage ?? game.missions.currentStageIndex ?? 0;
        const timeLeft = game.missions.timeLeft ?? 0;
        if (mTitle && m) mTitle.textContent = 'MISSION ' + (idx + 1) + '/10 — ' + m.name.toUpperCase();
        if (stageEl && st && m) stageEl.textContent = 'STAGE ' + (stage + 1) + '/' + m.stages.length + ' — ' + st.text;
        if (fill && m) fill.style.width = Math.round(((stage + 1) / m.stages.length) * 100) + '%';
        if (timerEl) timerEl.textContent = timeLeft > 0 ? '⏱ ' + Math.ceil(timeLeft) + 's LEFT' : '';
      } else if (game.missions.state === 'done') {
        if (mTitle) mTitle.textContent = 'STORY COMPLETE — FREE ROAM';
        if (stageEl) stageEl.textContent = 'Solmar Bay is yours. Keep the rank climbing.';
        if (fill) fill.style.width = '100%';
        if (timerEl) timerEl.textContent = '';
      } else {
        if (mTitle) mTitle.textContent = 'MISSION 1/10 — FRESH START';
        if (stageEl) stageEl.textContent = 'Press Start to begin the story';
        if (timerEl) timerEl.textContent = '';
      }
    }

    // Dispatch panel
    const disp = this.el('hud-dispatch');
    if (disp) {
      if (wanted >= 1) {
        disp.style.display = 'block';
        const list = this.el('hud-dispatch-list');
        let html = '';
        if (game.police && game.police.cars) {
          for (const car of game.police.cars) {
            const d = Math.round(dist2(pp.x, pp.z, car.pos.x, car.pos.z));
            html += '<div>' + (car.unitName || 'SBPD Unit') + ' · ' + (car.unitRole || 'PURSUE') + ' · ' + d + 'm</div>';
          }
        }
        if (game.police && game.police.airUnit) html += '<div class="disp-heli">AIR-1 · SPOTLIGHT · tracking you</div>';
        if (game.roadblocks && game.roadblocks.blocks && game.roadblocks.blocks.length > 0) html += '<div class="disp-block">ROADBLOCK · ' + game.roadblocks.blocks.length + ' set up ahead</div>';
        if (!html) html = '<div>Units en route…</div>';
        if (list) list.innerHTML = html;
      } else {
        disp.style.display = 'none';
      }
    }

    // Weapon slots + ammo
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
        if (w) this.ammoEl.textContent = w.id === 'fists' ? 'Fists ready' : 'Ammo ' + p.ammo[w.id] + ' (' + w.name + ')';
      }
    }

    // Rank bar
    if (p) {
      const rankName = this.el('hud-rank-name');
      if (rankName) rankName.textContent = p.rank().name;
      const rankFill = this.el('hud-rank-fill');
      if (rankFill) rankFill.style.width = Math.round(p.repProgress() * 100) + '%';
      const rankRep = this.el('hud-rank-rep');
      if (rankRep) {
        const next = p.nextRank();
        rankRep.textContent = next ? 'REP ' + p.rep + ' / ' + next.rep + ' → ' + next.name : 'REP ' + p.rep + ' — MAX RANK';
      }
    }

    // Crew chip (Mira)
    const crew = this.el('hud-crew');
    if (crew && p) {
      if (p.crewReady()) {
        crew.textContent = 'MIRA [Z] SWAP PLATES — READY';
        crew.classList.remove('cooling');
      } else {
        crew.textContent = 'MIRA [Z] SWAP PLATES — ' + Math.ceil(p.crewCooldown) + 's';
        crew.classList.add('cooling');
      }
    }

    // Radio strip
    const radio = this.el('hud-radio');
    if (radio && p) radio.textContent = '♪ ' + p.stationNow().name + ' — ' + p.songNow();

    // Car panel
    const carPanel = this.el('hud-car');
    if (carPanel) {
      if (player.mode === 'car' && player.car) {
        carPanel.style.display = 'block';
        const nameEl = this.el('hud-car-name');
        if (nameEl) nameEl.textContent = player.car.name || 'Meridian LX';
        const condEl = this.el('hud-car-cond');
        if (condEl) {
          const cond = Math.round(player.car.condition ?? 100);
          const smoking = player.car.smoking;
          condEl.textContent = 'CONDITION ' + cond + '%' + (smoking ? ' — SMOKING!' : '');
          condEl.classList.toggle('bad', cond < 35);
        }
        const gearEl = this.el('hud-car-gear');
        if (gearEl) {
          const carSpeed = player.carSpeed ?? player.car.speed ?? 0;
          const kmh = Math.abs(carSpeed) * 3.6;
          const gear = carSpeed < -0.5 ? 'R' : kmh < 1 ? 'N' : kmh < 30 ? '1' : kmh < 60 ? '2' : kmh < 90 ? '3' : kmh < 120 ? '4' : '5';
          gearEl.textContent = 'GEAR ' + gear + ' · TUNE ' + (p ? p.tune : 0) + '/3' + (p && p.armor > 0 ? ' · ARMOR ' + Math.round(p.armor) : '');
        }
      } else {
        carPanel.style.display = 'none';
      }
    }

    // District label
    const dist = this.el('hud-district');
    if (dist) dist.textContent = districtAt(pp.x, pp.z);

    // Shop hint
    const hint = this.el('hud-shophint');
    if (hint) hint.textContent = game.shops ? game.shops.hint(pp) : '';

    // Alert banner (sprint 2: distance rounded, mandatory)
    const alertEl = this.el('hud-alert');
    if (alertEl) {
      let msg = '';
      let warn = false;
      const heading = (player.mode === 'car' && player.car) ? player.car.angle : player.angle;
      const rb = game.roadblocks ? game.roadblocks.ahead(pp, heading, 90) : 0;
      const airActive = !!(game.police && game.police.airUnit);
      if (rb > 0) {
        msg = '⚠ ROADBLOCK AHEAD — ' + Math.round(rb) + 'm';
        warn = true;
      } else if (airActive) {
        msg = '✦ AIR-1 OVERHEAD — IN SIGHT';
      } else if (wanted >= 1) {
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

    // Objective + distance
    const obj = game.missions ? game.missions.objective() : null;
    if (this.objectiveEl && obj) this.objectiveEl.textContent = obj.text;
    if (this.distEl) this.distEl.textContent = obj && obj.target ? Math.round(dist2(pp.x, pp.z, obj.target.x, obj.target.z)) + 'm' : '';

    // Speedometer
    if (this.speedEl) {
      if (player.mode === 'car') {
        const carSpeed = player.carSpeed ?? (player.car ? player.car.speed : 0) ?? 0;
        this.speedEl.style.display = 'block';
        this.speedEl.textContent = Math.round(Math.abs(carSpeed) * 3.6) + ' km/h';
      } else {
        this.speedEl.style.display = 'none';
      }
    }

    this._drawMinimap(game, obj);
  }

  _drawPortrait(name) {
    const cv = this._portrait;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const looks = {
      Marlow: { skin: '#d8a878', hair: '#c8c8c8', shirt: '#4a5a6a', extra: 'cap' },
      Dana: { skin: '#e8b88a', hair: '#2a1a10', shirt: '#3a7ac0', extra: 'cap' },
      Mira: { skin: '#e8c0a0', hair: '#7a3ab0', shirt: '#2a2a3a', extra: 'band' },
      Vex: { skin: '#c98a5a', hair: '#101010', shirt: '#5a1a1a', extra: 'band' },
    };
    const look = looks[name] || { skin: '#e8b88a', hair: '#3a2a1a', shirt: '#3a7ac0', extra: '' };
    ctx.clearRect(0, 0, 72, 72);
    ctx.fillStyle = '#24303e';
    ctx.fillRect(0, 0, 72, 72);
    ctx.fillStyle = look.shirt;
    ctx.beginPath();
    ctx.moveTo(8, 72);
    ctx.quadraticCurveTo(36, 44, 64, 72);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = look.skin;
    ctx.beginPath();
    ctx.arc(36, 30, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = look.hair;
    ctx.beginPath();
    ctx.arc(36, 26, 17, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(19, 24, 34, 6);
    if (look.extra === 'cap') {
      ctx.fillStyle = '#c02020';
      ctx.fillRect(19, 12, 34, 8);
      ctx.fillRect(36, 18, 20, 4);
    }
    if (look.extra === 'band') {
      ctx.fillStyle = name === 'Mira' ? '#c9a0ff' : '#d02020';
      ctx.fillRect(19, 20, 34, 5);
    }
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(27, 30, 4, 4);
    ctx.fillRect(41, 30, 4, 4);
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
    const W = 700;
    const toX = (x) => ((x + W / 2) / W) * S;
    const toY = (z) => ((z + W / 2) / W) * S;
    const posOf = (e) => {
      if (!e) return null;
      if (typeof e.getPos === 'function') return e.getPos();
      if (e.pos) return e.pos;
      if (e.position) return e.position;
      return e;
    };
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(20,24,28,0.85)';
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#1d6fa8';
    ctx.fillRect(0, toY(300), S, S - toY(300));
    ctx.fillStyle = '#e6d3a3';
    ctx.fillRect(0, toY(262), S, toY(300) - toY(262));
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
    if (game.city && game.city.landmarks) {
      ctx.fillStyle = '#e8c832';
      const lms = Array.isArray(game.city.landmarks) ? game.city.landmarks : Object.values(game.city.landmarks);
      for (const lm of lms) {
        const lp = posOf(lm);
        if (!lp) continue;
        ctx.fillRect(toX(lp.x) - 2, toY(lp.z) - 2, 4, 4);
      }
    }
    if (obj && obj.target) {
      const tp = posOf(obj.target);
      if (tp) {
        const x = toX(tp.x);
        const y = toY(tp.z);
        ctx.fillStyle = '#ffd21f';
        ctx.beginPath();
        ctx.moveTo(x, y - 6);
        ctx.lineTo(x + 5, y);
        ctx.lineTo(x, y + 6);
        ctx.lineTo(x - 5, y);
        ctx.closePath();
        ctx.fill();
      }
    }
    if (game.traffic && game.traffic.cars) {
      ctx.fillStyle = '#ffffff';
      for (const car of game.traffic.cars) {
        const cp = posOf(car);
        if (!cp) continue;
        ctx.fillRect(toX(cp.x) - 1, toY(cp.z) - 1, 2, 2);
      }
    }
    if (game.police) {
      if (game.police.cars) {
        ctx.fillStyle = '#ff4040';
        for (const car of game.police.cars) {
          const cp = posOf(car);
          if (!cp) continue;
          ctx.fillRect(toX(cp.x) - 2, toY(cp.z) - 2, 4, 4);
        }
      }
      if (game.police.cops) {
        ctx.fillStyle = '#4080ff';
        for (const cop of game.police.cops) {
          const cp = posOf(cop);
          if (!cp) continue;
          ctx.fillRect(toX(cp.x) - 2, toY(cp.z) - 2, 4, 4);
        }
      }
    }
    if (game.combat && typeof game.combat.livingEnemies === 'function') {
      ctx.fillStyle = '#ff2020';
      for (const e of game.combat.livingEnemies()) {
        const ep = posOf(e);
        if (!ep) continue;
        ctx.beginPath();
        ctx.arc(toX(ep.x), toY(ep.z), 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (game.police && game.police.airUnit) {
      const ap = game.police.airUnit.group ? game.police.airUnit.group.position : null;
      if (ap) {
        ctx.fillStyle = '#ffe14d';
        ctx.beginPath();
        ctx.arc(toX(ap.x), toY(ap.z), 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (game.roadblocks && game.roadblocks.blocks) {
      ctx.fillStyle = '#ff9a3d';
      for (const b of game.roadblocks.blocks) {
        if (!b.cars) continue;
        for (const c of b.cars) {
          const cp = posOf(c);
          if (!cp) continue;
          ctx.fillRect(toX(cp.x) - 2, toY(cp.z) - 2, 4, 4);
        }
      }
    }
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
    if (this.dialogueName) this.dialogueName.textContent = name;
    if (this.dialogueText) this.dialogueText.textContent = text + '  (E to continue)';
  }

  hideDialogue() {
    if (this.dialogueEl) this.dialogueEl.style.display = 'none';
  }

  toast(msg) {
    if (!this.toastEl) return;
    this.toastEl.textContent = msg;
    this.toastEl.style.display = 'block';
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { this.toastEl.style.display = 'none'; }, 4000);
  }

  showOverlay(name) {
    for (const id of ['screen-start', 'screen-pause', 'screen-wasted', 'screen-busted', 'screen-complete']) {
      const el = this.el(id);
      if (el) el.style.display = (id === 'screen-' + name) ? 'flex' : 'none';
    }
  }

  hideOverlays() {
    for (const id of ['screen-start', 'screen-pause', 'screen-wasted', 'screen-busted', 'screen-complete']) {
      const el = this.el(id);
      if (el) el.style.display = 'none';
    }
  }
}
