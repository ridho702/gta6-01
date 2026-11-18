// Solmar Bay — all sound is synthesized with WebAudio: no audio files.
// A small synth engine: engine hum, sirens, gunshots, pickups, UI blips and a
// looping sun-soaked groove (bass + hats + plucked lead) that changes with wanted level.
export class SoundEngine {
  constructor() {
    this.ctx = null; this.master = null; this.musicGain = null;
    this.muted = false; this.musicTimer = null; this.step = 0;
    this.engineOsc = null; this.engineGain = null; this.sirenOsc = null; this.sirenGain = null;
    this.started = false;
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = 0.16;
    this.musicGain.connect(this.master);
    // engine drone
    this.engineOsc = this.ctx.createOscillator(); this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 50;
    this.engineGain = this.ctx.createGain(); this.engineGain.gain.value = 0;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320;
    this.engineOsc.connect(lp); lp.connect(this.engineGain); this.engineGain.connect(this.master);
    this.engineOsc.start();
    // police siren (two-tone)
    this.sirenOsc = this.ctx.createOscillator(); this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 700;
    this.sirenGain = this.ctx.createGain(); this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master);
    this.sirenOsc.start();
    this.started = true;
    this.startMusic();
  }
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.55;
  }
  setEngine(speed01, on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(on ? 0.05 + speed01 * 0.06 : 0, t, 0.1);
    this.engineOsc.frequency.setTargetAtTime(45 + speed01 * 130, t, 0.08);
  }
  setSiren(on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, t, 0.3);
    if (on && !this._sirenLfo) {
      this._sirenLfo = setInterval(() => {
        if (this.sirenOsc) this.sirenOsc.frequency.value = this.sirenOsc.frequency.value > 800 ? 660 : 920;
      }, 420);
    } else if (!on && this._sirenLfo) { clearInterval(this._sirenLfo); this._sirenLfo = null; }
  }
  blip(freq, dur, type, vol) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'square'; o.frequency.value = freq;
    g.gain.setValueAtTime(vol || 0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur);
  }
  noise(dur, vol, freq) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq || 1200;
    const g = this.ctx.createGain(); g.gain.value = vol || 0.25;
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t);
  }
  gunshot() { this.noise(0.16, 0.5, 900); this.blip(140, 0.1, 'sawtooth', 0.2); }
  punch() { this.noise(0.08, 0.3, 500); }
  pickup() { this.blip(660, 0.09, 'sine', 0.2); setTimeout(() => this.blip(990, 0.14, 'sine', 0.2), 90); }
  cash() { [523, 659, 784].forEach((f, i) => setTimeout(() => this.blip(f, 0.16, 'triangle', 0.18), i * 90)); }
  horn() { this.blip(370, 0.25, 'sawtooth', 0.12); this.blip(466, 0.25, 'sawtooth', 0.1); }
  crash() { this.noise(0.3, 0.4, 700); }
  mission() { [392, 523, 659, 784].forEach((f, i) => setTimeout(() => this.blip(f, 0.2, 'triangle', 0.18), i * 110)); }
  // Groove: A-minor funk loop, 16 steps. Bass on steps, hats off-beat, lead pluck.
  startMusic() {
    if (this.musicTimer) return;
    const bass = [55, 0, 55, 0, 65.4, 0, 55, 0, 49, 0, 49, 0, 58.3, 0, 73.4, 0];
    const lead = [220, 0, 261.6, 0, 0, 329.6, 0, 261.6, 0, 220, 0, 196, 0, 246.9, 0, 0];
    this.musicTimer = setInterval(() => {
      if (!this.ctx || this.muted) { this.step = (this.step + 1) % 16; return; }
      const s = this.step;
      const t = this.ctx.currentTime;
      if (bass[s]) {
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.type = 'triangle'; o.frequency.value = bass[s];
        g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.01, t + 0.22);
        o.connect(g); g.connect(this.musicGain); o.start(t); o.stop(t + 0.24);
      }
      if (lead[s]) {
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.type = 'square'; o.frequency.value = lead[s] * 2;
        g.gain.setValueAtTime(0.10, t); g.gain.exponentialRampToValueAtTime(0.01, t + 0.18);
        o.connect(g); g.connect(this.musicGain); o.start(t); o.stop(t + 0.2);
      }
      if (s % 2 === 1) { // hat tick
        const len = 800, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const src = this.ctx.createBufferSource(); src.buffer = buf;
        const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6000;
        const g = this.ctx.createGain(); g.gain.value = 0.12;
        src.connect(f); f.connect(g); g.connect(this.musicGain); src.start(t);
      }
      this.step = (this.step + 1) % 16;
    }, 170);
  }
}
