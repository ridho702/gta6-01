// Solmar Bay — save games in localStorage. The game autosaves after every
// mission and on the pause menu; the start screen offers Continue when a
// save exists.

const KEY = 'solmar-bay-save-v1';

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return data;
  } catch (e) {
    return null;
  }
}

export function saveGame(data) {
  try {
    const payload = {
      version: 1,
      savedAt: new Date().toISOString(),
      cash: Math.floor(data.cash || 0),
      missionIdx: data.missionIdx || 0,
      health: Math.floor(data.health || 100),
      pos: { x: data.pos ? data.pos.x : 0, z: data.pos ? data.pos.z : 0 },
      rep: data.rep || 0,
      rankIdx: data.rankIdx || 0,
      owned: data.owned || null,
      ammo: data.ammo || null,
      weapon: data.weapon || 'pistol',
      tune: data.tune || 0,
      armor: data.armor || 0,
      station: data.station || 0,
    };
    window.localStorage.setItem(KEY, JSON.stringify(payload));
    return true;
  } catch (e) {
    return false;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(KEY);
  } catch (e) {
    /* storage unavailable; nothing to clear */
  }
}
