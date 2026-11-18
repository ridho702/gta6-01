// Solmar Bay — the HUD: health and cash, clock and wanted stars, the
// objective line with distance, a circular minimap, the speedometer, the
// dialogue box, toast messages, and the menu overlays. All DOM; the game
// writes state into it once per frame.

import { formatCash, formatClock, dist2 } from './util.js';

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
  }

  update(game) {
    const player = game.player;
    if (this.healthFill) {
      this.healthFill.style.width = Math.max(0, player.health) + '%';
      this.healthFill.style.background = player.health > 50 ? '#4caf50' : player.health > 25 ? '#ff9800' : '#f44336';
    }
    if (this.cashEl) this.cashEl.textContent = formatCash(player.cash);
    if (this.ammoEl) this.ammoEl.textContent = 'Ammo ' + player.ammo;
    if (this.clockEl) this.clockEl.textContent = formatClock(game.clockMinutes);
    if (this.starsEl) {
      const w = game.police.wanted;
      this.starsEl.textContent = '★'.repeat(w) + '☆'.repeat(5 - w);
      this.starsEl.classList.toggle('hot', w > 0);
    }
    const obj = game.missions.objective();
    if (this.objectiveEl) this.objectiveEl.textContent = obj.text;
    if (this.distEl) {
      if (obj.target) {
        const pp = player.getPos();
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
    this.dialogueEl.style.display = 'block';
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
