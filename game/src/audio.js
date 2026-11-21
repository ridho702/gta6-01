// Solmar Bay — all sound is synthesized with the Web Audio API; the game
// ships no audio files. Music is a funk groove (bass + hats + chords)
// scheduled a little ahead of time. Effects are short oscillator/noise
// bursts. Audio starts only after a user gesture (the Start button), which
// is also when the AudioContext is created.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.muted = false;
    this._musicTimer = null;
    this._step = 0;
    this._nextTime = 0;
    this._engineOsc = null;
    this._engineGain = null;
    this._engineFilter = null;
    this._sirenOscA = null;
    this._sirenOscB = null;
    this._sirenGain = null;
    this._sirenOn = false;
    this._noiseBuf = null;
  }

  // Create the context. Must be called from a user gesture.
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.32;
    this.musicGain.connect(this.master);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.9;
    this.sfxGain.connect(this.master);
    // 1 second of white noise, reused by every percussive effect.
    const len = this.ctx.sampleRate;
    this._noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this._noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setValueAtTime(m ? 0 : 0.9, this.ctx.currentTime);
    }
  }

  _tone(freq, dur, type, vol, when, slideTo) {
    if (!this.ctx) return;
    const t0 = when ?? this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  _noise(dur, vol, when, filterFreq, filterType) {
    if (!this.ctx) return;
    const t0 = when ?? this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType || 'lowpass';
    filter.frequency.value = filterFreq || 1200;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.sfxGain);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  // Switch the music groove to a radio station's bass line + tempo.
  // Stations come from progress.js (STATIONS); the HUD shows now-playing.
  setStation(station) {
    if (!station) return;
    this._bassPattern = station.bass;
    this._bpm = station.bpm;
  }

  // ---- music: 16-step funk groove at 100 BPM, scheduled ahead ----
  startMusic() {
    if (!this.ctx || this._musicTimer) return;
    this._step = 0;
    this._nextTime = this.ctx.currentTime + 0.1;
    this._musicTimer = window.setInterval(() => {
      if (!this.ctx) return;
      while (this._nextTime < this.ctx.currentTime + 0.25) {
        // Read the station live so switching radio (KeyR) retunes the groove.
        const stepDur = 60 / (this._bpm || 100) / 4; // 16th notes
        const bass = this._bassPattern || [55, 0, 55, 0, 65.41, 0, 55, 0, 49, 0, 49, 0, 58.27, 0, 73.42, 0];
        // Chord stabs (Hz triples) on the off-beats.
        const chords = { 4: [220, 261.63, 329.63], 10: [196, 246.94, 293.66], 14: [220, 261.63, 329.63] };
        const s = this._step % 16;
        const t = this._nextTime;
        if (bass[s]) {
          const osc = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.value = bass[s];
          const f = this.ctx.createBiquadFilter();
          f.type = 'lowpass';
          f.frequency.value = 500;
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.5, t + 0.01);
          g.gain.exponentialRampToValueAtTime(0.001, t + stepDur * 1.8);
          osc.connect(f);
          f.connect(g);
          g.connect(this.musicGain);
          osc.start(t);
          osc.stop(t + stepDur * 2);
        }
        if (s % 4 === 2) {
          // Hat tick on the off 8ths.
          const src = this.ctx.createBufferSource();
          src.buffer = this._noiseBuf;
          const hp = this.ctx.createBiquadFilter();
          hp.type = 'highpass';
          hp.frequency.value = 7000;
          const g = this.ctx.createGain();
          g.gain.setValueAtTime(0.16, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
          src.connect(hp);
          hp.connect(g);
          g.connect(this.musicGain);
          src.start(t);
          src.stop(t + 0.05);
        }
        if (chords[s]) {
          for (const freq of chords[s]) {
            const osc = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.value = freq;
            g.gain.setValueAtTime(0, t);
            g.gain.linearRampToValueAtTime(0.12, t + 0.01);
            g.gain.exponentialRampToValueAtTime(0.001, t + stepDur * 3);
            osc.connect(g);
            g.connect(this.musicGain);
            osc.start(t);
            osc.stop(t + stepDur * 3);
          }
        }
        this._step++;
        this._nextTime += stepDur;
      }
    }, 90);
  }

  stopMusic() {
    if (this._musicTimer) {
      window.clearInterval(this._musicTimer);
      this._musicTimer = null;
    }
  }

  // ---- continuous engine hum; call every frame with speed 0..1 ----
  setEngine(on, speed01) {
    if (!this.ctx) return;
    if (on && !this._engineOsc) {
      this._engineOsc = this.ctx.createOscillator();
      this._engineOsc.type = 'sawtooth';
      this._engineFilter = this.ctx.createBiquadFilter();
      this._engineFilter.type = 'lowpass';
      this._engineFilter.frequency.value = 400;
      this._engineGain = this.ctx.createGain();
      this._engineGain.gain.value = 0;
      this._engineOsc.connect(this._engineFilter);
      this._engineFilter.connect(this._engineGain);
      this._engineGain.connect(this.sfxGain);
      this._engineOsc.start();
    }
    if (!on && this._engineOsc) {
      try { this._engineOsc.stop(); } catch (e) { /* already stopped */ }
      this._engineOsc = null;
      this._engineGain = null;
      this._engineFilter = null;
      return;
    }
    if (this._engineOsc) {
      const t = this.ctx.currentTime;
      this._engineOsc.frequency.setTargetAtTime(55 + speed01 * 165, t, 0.08);
      this._engineGain.gain.setTargetAtTime(0.05 + speed01 * 0.1, t, 0.08);
      this._engineFilter.frequency.setTargetAtTime(300 + speed01 * 900, t, 0.08);
    }
  }

  // Two-tone police siren, on/off.
  siren(on) {
    if (!this.ctx) return;
    if (on === this._sirenOn) return;
    this._sirenOn = on;
    if (on) {
      this._sirenGain = this.ctx.createGain();
      this._sirenGain.gain.value = 0.05;
      this._sirenGain.connect(this.sfxGain);
      this._sirenOscA = this.ctx.createOscillator();
      this._sirenOscA.type = 'sine';
      this._sirenOscA.frequency.value = 660;
      this._sirenOscB = this.ctx.createOscillator();
      this._sirenOscB.type = 'sine';
      this._sirenOscB.frequency.value = 880;
      const gA = this.ctx.createGain();
      const gB = this.ctx.createGain();
      // Alternate the two tones with slow LFOs in opposite phase.
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.9;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 0.5;
      lfo.connect(lfoGain);
      lfoGain.connect(gA.gain);
      const lfo2 = this.ctx.createOscillator();
      lfo2.frequency.value = 0.9;
      const lfoGain2 = this.ctx.createGain();
      lfoGain2.gain.value = -0.5;
      lfo2.connect(lfoGain2);
      lfoGain2.connect(gB.gain);
      gA.gain.value = 0.5;
      gB.gain.value = 0.5;
      this._sirenOscA.connect(gA);
      this._sirenOscB.connect(gB);
      gA.connect(this._sirenGain);
      gB.connect(this._sirenGain);
      this._sirenOscA.start();
      this._sirenOscB.start();
      lfo.start();
      lfo2.start();
      this._sirenLfo = lfo;
      this._sirenLfo2 = lfo2;
    } else if (this._sirenOscA) {
      try { this._sirenOscA.stop(); this._sirenOscB.stop(); this._sirenLfo.stop(); this._sirenLfo2.stop(); } catch (e) { /* already stopped */ }
      this._sirenOscA = null;
      this._sirenOscB = null;
      this._sirenGain = null;
    }
  }

  // ---- one-shot effects ----
  gunshot() {
    this._noise(0.16, 0.7, undefined, 900, 'lowpass');
    this._tone(160, 0.1, 'square', 0.25, undefined, 50);
  }

  enemyShot() {
    this._noise(0.12, 0.3, undefined, 800, 'lowpass');
  }

  punch() {
    this._noise(0.09, 0.5, undefined, 300, 'lowpass');
    this._tone(90, 0.09, 'sine', 0.4, undefined, 45);
  }

  horn() {
    this._tone(370, 0.35, 'square', 0.14);
    this._tone(466, 0.35, 'square', 0.1);
  }

  cash() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._tone(880, 0.12, 'sine', 0.25, t);
    this._tone(1318.5, 0.22, 'sine', 0.25, t + 0.09);
  }

  pickup() {
    this._tone(660, 0.1, 'sine', 0.25);
    this._tone(990, 0.16, 'sine', 0.25, this.ctx ? this.ctx.currentTime + 0.07 : undefined);
  }

  explosion() {
    this._noise(0.7, 0.8, undefined, 500, 'lowpass');
    this._tone(70, 0.6, 'sine', 0.5, undefined, 28);
  }

  blip() {
    this._tone(520, 0.07, 'sine', 0.2);
  }

  bust() {
    this._tone(220, 0.3, 'square', 0.2, undefined, 110);
  }
}
