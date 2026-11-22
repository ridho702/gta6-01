import { WEAPONS, districtAt } from './progress.js';
import { dist2 } from './util.js';

const GARAGE_ITEMS = [
  { id: 'repair', name: 'Full Repair', desc: 'Restore your car to 100% condition', price: 150 },
  { id: 'tune', name: 'Engine Tune', desc: 'Stage tune — +8% top speed (max 3)', price: 600 },
  { id: 'armor', name: 'Body Armor', desc: '+50 armor, absorbs damage first', price: 400 },
];

const RANKS = ['HUSTLER', 'RUNNER', 'FIXER', 'SHOT CALLER', 'BAY KING'];

function ammoPrice(w) {
  if (w.id === 'smg') return 120;
  if (w.id === 'shotgun') return 90;
  if (w.id === 'sniper') return 100;
  if (w.id === 'rpg') return 200;
  return 60;
}

export class Shops {
  constructor(game) {
    this.game = game;
    this.open = null;
    // Set when the shop transitions closed -> open (openShop is also called
    // from the main loop before update() runs in the same frame). update()
    // consumes it so the very E press that opened the shop cannot also
    // close it in the same frame.
    this._justOpened = false;

    const panel = document.createElement('div');
    panel.id = 'shop-panel';
    panel.style.display = 'none';
    panel.innerHTML =
      '<div id="shop-title"></div>' +
      '<div id="shop-sub"></div>' +
      '<div id="shop-items"></div>' +
      '<div id="shop-foot">E / click outside to close</div>';
    document.body.appendChild(panel);

    this.panel = panel;
    this.titleEl = panel.querySelector('#shop-title');
    this.subEl = panel.querySelector('#shop-sub');
    this.itemsEl = panel.querySelector('#shop-items');

    panel.addEventListener('click', (e) => {
      if (e.target === panel) this.close();
    });
  }

  _nearShop(playerPos) {
    const lm = this.game.city.landmarks;
    if (dist2(playerPos.x, playerPos.z, lm.gunShop.x, lm.gunShop.z) < 10) return 'arms';
    if (dist2(playerPos.x, playerPos.z, lm.garage.x, lm.garage.z) < 12) return 'garage';
    return null;
  }

  _render() {
    const player = this.game.player;
    const progress = this.game.progress;
    const cash = Math.floor(player.cash);
    this.itemsEl.innerHTML = '';

    if (this.open === 'arms') {
      this.titleEl.textContent = 'SOLMAR ARMS';
      this.subEl.textContent = 'Guns, ammo, no questions. Cash: $' + cash;
      for (const w of WEAPONS) {
        if (w.id === 'fists') continue;
        const row = document.createElement('div');
        row.className = 'shop-row';
        const label = document.createElement('span');
        const owned = !!progress.owned[w.id];
        const btn = document.createElement('button');
        if (owned) {
          const price = ammoPrice(w);
          label.textContent =
            w.name + ' — AMMO ' + (progress.ammo[w.id] || 0) + '  [buy ammo $' + price + ']';
          btn.textContent = 'AMMO';
          if (player.cash < price) btn.disabled = true;
        } else {
          const canBuy = progress.canBuy(w);
          label.textContent =
            w.name + ' — $' + w.price +
            (canBuy ? '' : ' — LOCKED: needs ' + RANKS[w.rank]);
          btn.textContent = 'BUY';
          if (!canBuy || player.cash < w.price) btn.disabled = true;
        }
        btn.addEventListener('click', () => this._buyWeapon(w));
        row.appendChild(label);
        row.appendChild(btn);
        this.itemsEl.appendChild(row);
      }
      return;
    }

    if (this.open === 'garage') {
      this.titleEl.textContent = "MARLOW'S GARAGE";
      const car = player.car;
      const carText = car ? ('Car: ' + Math.round(car.condition) + '% condition') : 'on foot';
      this.subEl.textContent =
        'Repairs & tunes. Cash: $' + cash + ' · ' + carText +
        ' · Tune stage ' + progress.tune + '/3 · Armor ' + progress.armor;
      for (const item of GARAGE_ITEMS) {
        const row = document.createElement('div');
        row.className = 'shop-row';
        const label = document.createElement('span');
        label.textContent = item.name + ' — $' + item.price;
        const desc = document.createElement('span');
        desc.className = 'shop-desc';
        desc.textContent = item.desc;
        const btn = document.createElement('button');
        btn.textContent = 'BUY';
        if (player.cash < item.price) btn.disabled = true;
        if (item.id === 'tune' && progress.tune >= 3) btn.disabled = true;
        if (item.id === 'armor' && progress.armor >= 100) btn.disabled = true;
        if (item.id === 'repair' && !car) btn.disabled = true;
        btn.addEventListener('click', () => this._buyGarage(item));
        row.appendChild(label);
        row.appendChild(desc);
        row.appendChild(btn);
        this.itemsEl.appendChild(row);
      }
    }
  }

  _buyWeapon(w) {
    const player = this.game.player;
    const progress = this.game.progress;
    if (progress.owned[w.id]) {
      const res = progress.buyAmmo(w, player.cash);
      if (res.ok) {
        player.cash -= res.cost;
        this.game.hud.toast('Ammo restocked: ' + w.name);
        this.game.audio.cash();
      } else {
        this.game.hud.toast(res.reason);
      }
    } else {
      const res = progress.buyWeapon(w, player.cash);
      if (res.ok) {
        player.cash -= res.cost;
        progress.selectWeapon(w.id);
        this.game.hud.toast(w.name + ' purchased — press ' + w.slot + ' to equip');
        this.game.audio.cash();
      } else {
        this.game.hud.toast(res.reason);
      }
    }
    this._render();
  }

  _buyGarage(item) {
    const player = this.game.player;
    const progress = this.game.progress;
    if (player.cash < item.price) {
      this.game.hud.toast('Not enough cash');
      return;
    }
    if (item.id === 'repair') {
      if (!player.car) return;
      player.car.condition = 100;
      player.car.smoking = false;
    } else if (item.id === 'tune') {
      if (progress.tune >= 3) return;
      progress.tune++;
    } else if (item.id === 'armor') {
      if (progress.armor >= 100) return;
      progress.armor = Math.min(100, progress.armor + 50);
    }
    player.cash -= item.price;
    progress.addRep(10);
    this.game.hud.toast(item.name + ' installed');
    this.game.audio.cash();
    this._render();
  }

  openShop(kind) {
    if (!this.open) this._justOpened = true;
    this.open = kind;
    this._render();
    this.panel.style.display = 'block';
  }

  close() {
    this.open = null;
    this._justOpened = false;
    this.panel.style.display = 'none';
  }

  update(dt) {
    const pos = this.game.player.getPos();
    // Snapshot the open state at the start of this call: one E press may do
    // exactly one action (open OR close), never both in the same frame.
    const wasOpen = this.open;

    if (wasOpen) {
      const anchor = wasOpen === 'arms'
        ? this.game.city.landmarks.gunShop
        : this.game.city.landmarks.garage;
      if (dist2(pos.x, pos.z, anchor.x, anchor.z) > 16) {
        this.close();
        return;
      }
      // The press that opened the shop (openShop ran earlier this same
      // frame) must not also close it: one E press = one action.
      const justOpened = this._justOpened;
      this._justOpened = false;
      if (!justOpened && this.game.input.wasPressed('KeyE')) this.close();
      return;
    }

    const stage = this.game.missions.currentStage();
    const dlg = this.game.missions.dialogue;
    const dialogueOpen =
      Array.isArray(dlg) && dlg.length > 0 && this.game.missions.dialogueIdx < dlg.length;
    const eOwned = dialogueOpen ||
      (stage && (stage.type === 'steal' || stage.type === 'grab' || stage.type === 'hold'));

    if (this.game.input.wasPressed('KeyE') && !eOwned) {
      const near = this._nearShop(pos);
      if (near) this.openShop(near);
    }
  }

  hint(playerPos) {
    if (this.open) {
      return 'E — close ' + (this.open === 'arms' ? 'Solmar Arms' : "Marlow's Garage");
    }
    const near = this._nearShop(playerPos);
    if (near === 'arms') return 'E — Solmar Arms (weapons & ammo)';
    if (near === 'garage') return "E — Marlow's Garage (repair / tune / armor)";
    return '';
  }

  district(playerPos) {
    return districtAt(playerPos.x, playerPos.z);
  }
}
