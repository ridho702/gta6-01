// Solmar Bay — shops: Solmar Arms (weapons + ammo) and Marlow's Garage
// (repairs, engine tunes, armor). Walk up to a shop marker, press E, and
// a small menu opens; buying spends cash from the player. The game keeps
// running while the menu is open, so buy fast when the cops are near.
// The panel is built by this module so index.html stays small.

import { WEAPONS, districtAt } from './progress.js';
import { dist2 } from './util.js';

const GARAGE_ITEMS = [
  { id: 'repair', name: 'Full Repair', desc: 'Restore your car to 100% condition', price: 150 },
  { id: 'tune', name: 'Engine Tune', desc: 'Stage tune — +8% top speed (max 3)', price: 600 },
  { id: 'armor', name: 'Body Armor', desc: '+50 armor, absorbs damage first', price: 400 },
];

export class Shops {
  constructor(game) {
    this.game = game;
    this.open = null; // 'arms' | 'garage' | null
    this._buildPanel();
  }

  _buildPanel() {
    const div = document.createElement('div');
    div.id = 'shop-panel';
    div.style.display = 'none';
    div.innerHTML =
      '<div id="shop-title"></div><div id="shop-sub"></div>' +
      '<div id="shop-items"></div>' +
      '<div id="shop-foot">E / click outside to close</div>';
    document.body.appendChild(div);
    this.panel = div;
    this.titleEl = div.querySelector('#shop-title');
    this.subEl = div.querySelector('#shop-sub');
    this.itemsEl = div.querySelector('#shop-items');
    div.addEventListener('click', (e) => {
      if (e.target === div) this.close();
    });
  }

  _nearShop(playerPos) {
    const L = this.game.city.landmarks;
    if (dist2(playerPos.x, playerPos.z, L.gunShop.x, L.gunShop.z) < 10) return 'arms';
    if (dist2(playerPos.x, playerPos.z, L.garage.x, L.garage.z) < 12) return 'garage';
    return null;
  }

  _render() {
    const p = this.game.progress;
    const player = this.game.player;
    if (this.open === 'arms') {
      this.titleEl.textContent = 'SOLMAR ARMS';
      this.subEl.textContent = 'Guns, ammo, no questions. Cash: $' + Math.floor(player.cash);
      this.itemsEl.innerHTML = '';
      for (const w of WEAPONS) {
        if (w.id === 'fists') continue;
        const owned = p.owned[w.id];
        const row = document.createElement('div');
        row.className = 'shop-row';
        const lock = owned ? '' : (!p.canBuy(w) ? ' — LOCKED: needs ' + ['HUSTLER', 'RUNNER', 'FIXER', 'SHOT CALLER', 'BAY KING'][w.rank] + ' rank' : '');
        const label = owned
          ? w.name + ' — AMMO ' + p.ammo[w.id] + '  [buy ammo $' + (w.id === 'smg' ? 120 : w.id === 'shotgun' ? 90 : 60) + ']'
          : w.name + ' — $' + w.price + lock;
        row.innerHTML = '<span>' + label + '</span>';
        const btn = document.createElement('button');
        btn.textContent = owned ? 'AMMO' : 'BUY';
        btn.disabled = !owned && (!p.canBuy(w) || player.cash < w.price);
        if (owned && player.cash < (w.id === 'smg' ? 120 : w.id === 'shotgun' ? 90 : 60)) btn.disabled = true;
        btn.addEventListener('click', () => this._buyWeapon(w));
        row.appendChild(btn);
        this.itemsEl.appendChild(row);
      }
    } else if (this.open === 'garage') {
      this.titleEl.textContent = "MARLOW'S GARAGE";
      const car = player.car;
      const cond = car ? Math.round(car.condition || 100) + '% condition' : 'on foot';
      this.subEl.textContent = 'Repairs & tunes. Cash: $' + Math.floor(player.cash) + ' · Car: ' + cond +
        ' · Tune stage ' + p.tune + '/3 · Armor ' + Math.round(p.armor);
      this.itemsEl.innerHTML = '';
      for (const item of GARAGE_ITEMS) {
        const row = document.createElement('div');
        row.className = 'shop-row';
        let disabled = player.cash < item.price;
        if (item.id === 'tune' && p.tune >= 3) disabled = true;
        if (item.id === 'armor' && p.armor >= 100) disabled = true;
        if (item.id === 'repair' && !car) disabled = true;
        row.innerHTML = '<span>' + item.name + ' — $' + item.price + '<br><small>' + item.desc + '</small></span>';
        const btn = document.createElement('button');
        btn.textContent = 'BUY';
        btn.disabled = disabled;
        btn.addEventListener('click', () => this._buyGarage(item));
        row.appendChild(btn);
        this.itemsEl.appendChild(row);
      }
    }
  }

  _buyWeapon(w) {
    const p = this.game.progress;
    const player = this.game.player;
    if (p.owned[w.id]) {
      const r = p.buyAmmo(w, player.cash);
      if (r.ok) {
        player.cash -= r.cost;
        this.game.hud.toast('Ammo restocked: ' + w.name);
        if (this.game.audio) this.game.audio.cash();
      } else {
        this.game.hud.toast(r.reason);
      }
    } else {
      const r = p.buyWeapon(w, player.cash);
      if (r.ok) {
        player.cash -= r.cost;
        p.selectWeapon(w.id);
        this.game.hud.toast(w.name + ' purchased — press ' + w.slot + ' to equip');
        if (this.game.audio) this.game.audio.cash();
      } else {
        this.game.hud.toast(r.reason);
      }
    }
    this._render();
  }

  _buyGarage(item) {
    const p = this.game.progress;
    const player = this.game.player;
    if (player.cash < item.price) {
      this.game.hud.toast('Not enough cash');
      return;
    }
    if (item.id === 'repair') {
      if (!player.car) return;
      player.car.condition = 100;
      player.car.smoking = false;
    } else if (item.id === 'tune') {
      if (p.tune >= 3) return;
      p.tune++;
    } else if (item.id === 'armor') {
      if (p.armor >= 100) return;
      p.armor = Math.min(100, p.armor + 50);
    }
    player.cash -= item.price;
    p.addRep(10);
    this.game.hud.toast(item.name + ' installed');
    if (this.game.audio) this.game.audio.cash();
    this._render();
  }

  openShop(kind) {
    this.open = kind;
    this._render();
    this.panel.style.display = 'block';
  }

  close() {
    this.open = null;
    this.panel.style.display = 'none';
  }

  update(dt) {
    const game = this.game;
    const pp = game.player.getPos();
    if (this.open) {
      // Auto-close if the player walks away.
      const L = game.city.landmarks;
      const anchor = this.open === 'arms' ? L.gunShop : L.garage;
      if (dist2(pp.x, pp.z, anchor.x, anchor.z) > 16) this.close();
      return;
    }
    // E near a shop opens it (only when no mission stage owns E).
    const st = game.missions.currentStage();
    const dialogueOpen = game.missions.dialogueIdx < game.missions.dialogue.length;
    const eOwned = dialogueOpen || (st && ['steal', 'grab', 'hold'].includes(st.type));
    if (!eOwned && game.input.wasPressed('KeyE')) {
      const near = this._nearShop(pp);
      if (near) this.openShop(near);
    }
    if (game.input.wasPressed('KeyE') && this.open) this.close();
  }

  // Hint line for the HUD: "E — Solmar Arms" when standing at a shop.
  hint(playerPos) {
    if (this.open) return 'E — close ' + (this.open === 'arms' ? 'Solmar Arms' : "Marlow's Garage");
    const near = this._nearShop(playerPos);
    if (near === 'arms') return 'E — Solmar Arms (weapons & ammo)';
    if (near === 'garage') return "E — Marlow's Garage (repair / tune / armor)";
    return '';
  }

  // District label helper, used by the HUD.
  district(playerPos) {
    return districtAt(playerPos.x, playerPos.z);
  }
}
