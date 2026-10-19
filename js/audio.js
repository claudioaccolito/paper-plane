// Tutti i suoni sono sintetizzati al volo: nessun file audio da scaricare.
const PENTA = [0, 2, 4, 7, 9];

export class Sound {
  constructor(muted) {
    this.ctx = null;
    this.muted = muted;
  }

  // Va chiamato dentro un gesto dell'utente (click/tap), altrimenti il browser blocca l'audio.
  init() {
    if (this.ctx) {
      this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.7;
    this.master.connect(ctx.destination);

    // eco morbida per far "brillare" le note
    this.fx = ctx.createGain();
    this.fx.gain.value = 0.35;
    const delay = ctx.createDelay();
    delay.delayTime.value = 0.27;
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    this.fx.connect(delay);
    delay.connect(lp);
    lp.connect(fb);
    fb.connect(delay);
    lp.connect(this.master);

    // rumore bianco riutilizzato per vento e fruscii
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    const wind = ctx.createBufferSource();
    wind.buffer = this.noise;
    wind.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 500;
    this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    wind.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.master);
    wind.start();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.05);
  }

  suspend() {
    if (this.ctx) this.ctx.suspend();
  }

  resume() {
    if (this.ctx) this.ctx.resume();
  }

  tone(freq, start, dur, gain, type = 'sine') {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(gain, start + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g);
    g.connect(this.master);
    g.connect(this.fx);
    o.start(start);
    o.stop(start + dur + 0.05);
  }

  chime(step, golden) {
    if (!this.ctx || this.muted) return;
    const s = Math.min(step, 14);
    const semi = PENTA[s % 5] + 12 * Math.floor(s / 5);
    const f = 523.25 * Math.pow(2, semi / 12);
    const t = this.ctx.currentTime;
    this.tone(f, t, 0.7, 0.16);
    this.tone(f * 2, t, 0.35, 0.04, 'triangle');
    if (golden) {
      this.tone(f * 1.5, t + 0.09, 1.1, 0.12);
      this.tone(f * 2, t + 0.18, 1.3, 0.1);
      this.tone(f * 3, t + 0.27, 1.4, 0.05);
    }
  }

  whoosh() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(1800, t + 0.25);
    f.frequency.exponentialRampToValueAtTime(200, t + 0.9);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.18, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t, Math.random());
    src.stop(t + 1);
  }

  update(speed, cloud, playing) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const target = playing ? 0.025 + cloud * 0.07 : 0.012;
    this.windGain.gain.setTargetAtTime(target, t, 0.3);
    this.windFilter.frequency.setTargetAtTime(250 + speed * 18 + cloud * 700, t, 0.3);
  }
}
