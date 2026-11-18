// Solmar Bay — save / load via localStorage (progress auto-saves after each
// mission and from the pause menu).
const KEY = 'solmar-bay-save-v1';
export function saveGameData(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); return true; }
  catch (e) { return false; }
}
export function loadGameData() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
export function clearSaveData() {
  try { localStorage.removeItem(KEY); } catch (e) { /* no storage */ }
}
export function hasSave() { return loadGameData() !== null; }
