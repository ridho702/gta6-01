// Solmar Bay — keyboard and mouse input. Tracks held keys, edge-triggered
// presses (wasPressed is true only on the frame the key went down), and
// mouse drag deltas used to orbit the camera. The game loop calls endFrame()
// once per frame to clear the edge set.

export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.mouseButtons = new Set();
    this._dragging = false;
    this._lastX = 0;
    this._lastY = 0;
    this._onKeyDown = (e) => {
      // Ignore auto-repeat: a held key must not re-trigger actions.
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      // Keep the page from scrolling on game keys.
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    };
    this._onKeyUp = (e) => {
      this.keys.delete(e.code);
    };
    this._onMouseDown = (e) => {
      this.mouseButtons.add(e.button);
      this.pressed.add('Mouse' + e.button);
      if (e.button === 0) {
        this._dragging = true;
        this._lastX = e.clientX;
        this._lastY = e.clientY;
      }
    };
    this._onMouseUp = (e) => {
      this.mouseButtons.delete(e.button);
      if (e.button === 0) this._dragging = false;
    };
    this._onMouseMove = (e) => {
      if (!this._dragging) return;
      this.mouseDX += e.clientX - this._lastX;
      this.mouseDY += e.clientY - this._lastY;
      this._lastX = e.clientX;
      this._lastY = e.clientY;
    };
    this._onBlur = () => {
      this.keys.clear();
      this.pressed.clear();
      this.mouseButtons.clear();
      this._dragging = false;
    };
  }

  attach() {
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('blur', this._onBlur);
  }

  detach() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('blur', this._onBlur);
  }

  isDown(code) {
    return this.keys.has(code);
  }

  wasPressed(code) {
    return this.pressed.has(code);
  }

  // Left mouse button pressed this frame (for shooting).
  clicked() {
    return this.pressed.has('Mouse0');
  }

  // Consume the accumulated drag deltas and reset them to zero.
  consumeMouse() {
    const dx = this.mouseDX;
    const dy = this.mouseDY;
    this.mouseDX = 0;
    this.mouseDY = 0;
    return { dx, dy };
  }

  // Call once per frame, after the game has read the input state.
  endFrame() {
    this.pressed.clear();
    // Drag deltas are consumed by the camera; anything left over dies here
    // so a drag cannot leak into the next frame.
    this.mouseDX = 0;
    this.mouseDY = 0;
  }
}
