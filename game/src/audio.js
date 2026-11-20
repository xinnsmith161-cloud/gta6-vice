// All sound is synthesized with WebAudio — no audio files, no network.
// Engine hum, sirens, gunshots, pickups and a low-key music loop.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = 0;
    this.sirenHigh = false;
    this.musicTimer = 0;
    this.musicStep = 0;
    this.started = false;
  }

  /** Must be called from a user gesture at least once. */
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.14;
    this.musicGain.connect(this.master);
    // Engine: sawtooth through a lowpass, pitch follows speed.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 420;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    // Siren: two-tone square wave, toggled by update().
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'square';
    this.sirenOsc.frequency.value = 720;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
    this.started = true;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.5;
  }

  /** speed 0..1, inCar boolean. Call every frame. */
  update(dt, speed01, inCar, wanted) {
    if (!this.ctx) return;
    // Engine hum
    const target = inCar ? 0.05 + speed01 * 0.11 : 0;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
    this.engineOsc.frequency.setTargetAtTime(55 + speed01 * 165, this.ctx.currentTime, 0.1);
    this.engineFilter.frequency.setTargetAtTime(380 + speed01 * 900, this.ctx.currentTime, 0.1);
    // Siren when wanted
    const sirenOn = wanted > 0;
    this.sirenGain.gain.setTargetAtTime(sirenOn ? 0.045 : 0, this.ctx.currentTime, 0.2);
    if (sirenOn) {
      this.sirenTimer += dt;
      if (this.sirenTimer > 0.42) {
        this.sirenTimer = 0;
        this.sirenHigh = !this.sirenHigh;
        this.sirenOsc.frequency.setTargetAtTime(this.sirenHigh ? 950 : 700, this.ctx.currentTime, 0.02);
      }
    }
    // Music: a slow minor groove, one note per step.
    this.musicTimer += dt;
    if (this.musicTimer > 0.24) {
      this.musicTimer = 0;
      this.playMusicStep();
    }
  }

  playMusicStep() {
    if (!this.ctx || this.muted) return;
    // A minor: Am – F – C – G bass, with a soft pluck on top.
    const bassNotes = [55, 43.65, 65.41, 49];
    const bar = Math.floor(this.musicStep / 8) % 4;
    const stepInBar = this.musicStep % 8;
    const t = this.ctx.currentTime;
    if (stepInBar === 0) this.note(bassNotes[bar], 1.9, 'triangle', 0.16, t);
    if (stepInBar === 4) this.note(bassNotes[bar] * 1.5, 0.9, 'triangle', 0.1, t);
    const pluckScale = [220, 261.63, 329.63, 440, 523.25];
    if (stepInBar % 2 === 0) {
      const n = pluckScale[(this.musicStep * 7 + bar * 3) % pluckScale.length];
      this.note(n, 0.5, 'sine', 0.05, t);
    }
    this.musicStep += 1;
  }

  note(freq, dur, type, vol, when) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    o.connect(g);
    g.connect(this.musicGain);
    o.start(when);
    o.stop(when + dur + 0.05);
  }

  /** Short noise burst (gunshot, impact). */
  noiseBurst(dur, vol, filterFreq) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t);
  }

  blip(freq, dur, type, vol) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  gunshot() { this.noiseBurst(0.14, 0.5, 1800); this.blip(120, 0.08, 'sine', 0.4); }
  punch() { this.noiseBurst(0.08, 0.3, 900); }
  pickup() { this.blip(880, 0.09, 'sine', 0.22); setTimeout(() => this.blip(1318, 0.12, 'sine', 0.22), 70); }
  missionDone() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.blip(f, 0.22, 'triangle', 0.25), i * 110));
  }
  crash() { this.noiseBurst(0.3, 0.5, 500); }
  busted() { this.blip(220, 0.4, 'sawtooth', 0.25); setTimeout(() => this.blip(165, 0.5, 'sawtooth', 0.25), 200); }
  explosion() { this.noiseBurst(0.7, 0.7, 300); this.blip(60, 0.6, 'sine', 0.5); }
}
