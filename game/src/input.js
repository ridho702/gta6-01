// Solmar Bay — keyboard + mouse input (WASD, E, F, Space, C, P, M, H, drag-look).
export class Input {
  constructor(canvas) {
    this.keys = {};
    this.mouseDown = false;
    this.mouseDX = 0; this.mouseDY = 0;
    this.wheel = 0;
    this.clicked = false; // left click this frame (shoot)
    this.onKey = null;
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys[e.code] = true;
      if (this.onKey) this.onKey(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) { this.mouseDown = true; this.clicked = true; }
    });
    window.addEventListener('mouseup', () => { this.mouseDown = false; });
    window.addEventListener('mousemove', (e) => {
      if (this.mouseDown) { this.mouseDX += e.movementX; this.mouseDY += e.movementY; }
    });
    canvas.addEventListener('wheel', (e) => { this.wheel += e.deltaY; e.preventDefault(); }, { passive: false });
    window.addEventListener('blur', () => { this.keys = {}; this.mouseDown = false; });
  }
  axis(neg, pos) { return (this.keys[pos] ? 1 : 0) - (this.keys[neg] ? 1 : 0); }
  endFrame() { this.clicked = false; this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0; }
}
