// Solmar Bay — HUD: DOM readouts, wanted stars, dialogue, toasts and the
// circular minimap (roads, player, traffic, police, mission marker).
import { STREETS, LANDMARKS } from './city.js';

export class HUD {
  constructor() {
    this.cashEl = document.getElementById('cashVal');
    this.healthFill = document.getElementById('healthFill');
    this.healthText = document.getElementById('healthText');
    this.wantedEl = document.getElementById('wanted');
    this.objectiveEl = document.getElementById('objective');
    this.distEl = document.getElementById('objectiveDist');
    this.titleEl = document.getElementById('missionTitle');
    this.toastEl = document.getElementById('toast');
    this.dialogueEl = document.getElementById('dialogue');
    this.speakerEl = document.getElementById('speaker');
    this.dialogueTextEl = document.getElementById('dialogueText');
    this.speedoEl = document.getElementById('speedo');
    this.speedEl = document.getElementById('speedVal');
    this.carNameEl = document.getElementById('carName');
    this.hintEl = document.getElementById('hint');
    this.crossEl = document.getElementById('crosshair');
    this.messageEl = document.getElementById('message');
    this.clockEl = document.getElementById('clock');
    this.map = document.getElementById('minimap');
    this.mapCtx = this.map.getContext('2d');
    this.toastT = null;
    this.setWanted(0);
  }
  setCash(v) { this.cashEl.textContent = v.toLocaleString('en-US'); }
  setHealth(h) {
    this.healthFill.style.width = Math.max(0, h) + '%';
    this.healthText.textContent = Math.ceil(Math.max(0, h));
    this.healthFill.style.background = h > 50 ? 'linear-gradient(90deg,#ff5a4e,#ff9d4e)' : h > 25 ? 'linear-gradient(90deg,#ff9d4e,#ffd23e)' : '#ff2020';
  }
  setWanted(n) {
    let s = '';
    for (let i = 0; i < 5; i++) s += `<span class="star${i < n ? ' on' : ''}">★</span>`;
    this.wantedEl.innerHTML = s;
  }
  setObjective(text, title) {
    this.objectiveEl.textContent = text;
    if (title) this.titleEl.textContent = title;
  }
  setObjectiveDist(text) { this.distEl.textContent = text; }
  setClock(hours, minutes) {
    const h = Math.floor(hours) % 24, m = Math.floor(minutes);
    const icon = (h >= 6 && h < 18) ? '☀' : '🌙';
    this.clockEl.textContent = `${icon} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  showToast(text) {
    this.toastEl.textContent = text;
    this.toastEl.style.opacity = '1';
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => { this.toastEl.style.opacity = '0'; }, 2600);
  }
  showDialogue(speaker, text) {
    this.speakerEl.textContent = speaker + ':';
    this.dialogueTextEl.textContent = text;
    this.dialogueEl.classList.remove('hidden');
  }
  hideDialogue() { this.dialogueEl.classList.add('hidden'); }
  setSpeed(mph, carName, inCar) {
    this.speedoEl.classList.toggle('hidden', !inCar);
    if (inCar) { this.speedEl.textContent = Math.round(Math.abs(mph)); this.carNameEl.textContent = carName; }
  }
  setHint(text) { this.hintEl.textContent = text; }
  setCrosshair(on) { this.crossEl.classList.toggle('hidden', !on); }
  setMessage(text) { this.messageEl.textContent = text; }
  drawMinimap(game) {
    const ctx = this.mapCtx, S = 220, C = S / 2;
    const scale = S / 700;
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath(); ctx.arc(C, C, C - 2, 0, Math.PI * 2); ctx.clip();
    // water + land
    ctx.fillStyle = '#0d2a3a'; ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#173d2e'; ctx.fillRect(C - 310 * scale, 0, 620 * scale, S);
    ctx.fillStyle = '#e8d29a'; ctx.fillRect(C - 335 * scale, 0, 24 * scale, S);
    // roads
    ctx.strokeStyle = '#3a3f4a'; ctx.lineWidth = 9 * scale * 2.2;
    for (const s of STREETS) {
      const v = C + s * scale;
      ctx.beginPath(); ctx.moveTo(0, v); ctx.lineTo(S, v); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(v, 0); ctx.lineTo(v, S); ctx.stroke();
    }
    ctx.strokeStyle = '#e8c33c'; ctx.lineWidth = 1;
    for (const s of STREETS) {
      const v = C + s * scale;
      ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.moveTo(0, v); ctx.lineTo(S, v); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(v, 0); ctx.lineTo(v, S); ctx.stroke();
    }
    ctx.setLineDash([]);
    const dot = (x, z, color, r) => {
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(C + x * scale, C + z * scale, r, 0, Math.PI * 2); ctx.fill();
    };
    // landmarks
    for (const k of Object.keys(LANDMARKS)) dot(LANDMARKS[k].x, LANDMARKS[k].z, 'rgba(255,255,255,0.5)', 2);
    // traffic
    for (const c of game.traffic) dot(c.x, c.z, '#cfe8ff', 2.5);
    // mission marker
    const t = game.missions.currentTarget();
    if (t && game.missions.active) {
      const pulse = 5 + Math.sin(performance.now() / 200) * 2;
      dot(t.x, t.z, '#ffd23e', pulse);
      ctx.strokeStyle = '#ffd23e'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(C + t.x * scale, C + t.z * scale, pulse + 4, 0, Math.PI * 2); ctx.stroke();
    }
    // police
    for (const c of game.wanted.policeCars) dot(c.x, c.z, '#4a7dff', 4);
    for (const c of game.wanted.footCops) dot(c.x, c.z, '#4a7dff', 3);
    // player arrow
    const p = game.playerPos();
    ctx.save();
    ctx.translate(C + p.x * scale, C + p.z * scale);
    ctx.rotate(-game.playerHeading);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(6, 7); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#10202f'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
    ctx.restore();
    // north tick
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('N', C, 13);
  }
}
