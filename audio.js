/**
 * JutsuSounds — 5 âm thanh:
 *   naruto, sasuke, katon  → load từ file
 *   clone, wood            → tổng hợp
 */
function makeSynthSound(kind, rate) {
  const durations = { clone: 1.15, wood: 3.2, katon: 2.4 };
  const duration = durations[kind];
  if (!duration) throw new Error('Unknown synth sound');

  const data = new Float32Array(Math.ceil(duration * rate));
  let seed = 7831, low = 0, phase = 0;

  for (let i = 0; i < data.length; i++) {
    const t = i / rate, u = t / duration;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 2147483648 - 1;
    low += .025 * (noise - low);
    let value = 0;

    if (kind === 'wood') {
      const crack = Math.pow(Math.max(0, Math.sin(t*29)*Math.sin(t*47)), 14);
      value = .34*Math.sin(2*Math.PI*(46*t-2*t*t))*Math.exp(-t*.8)
            + low*2.2 + noise*crack*.8
            + Math.sin(t*2*Math.PI*112)*crack*.24;
    } else if (kind === 'clone') {
      value = noise*.65*Math.exp(-t*4)
            + low*2.8*Math.exp(-t*2)
            + Math.sin(2*Math.PI*(90*t-24*t*t))*.32*Math.exp(-t*6);
    } else if (kind === 'katon') {
      const crackle = Math.pow(Math.max(0, Math.sin(t*37)*Math.sin(t*53)), 12);
      value = .28*Math.sin(2*Math.PI*(72*t-4*t*t))*Math.exp(-t*.6)
            + low*2.1 + noise*crackle*.7
            + Math.sin(2*Math.PI*180*t)*crackle*.15;
    }

    const envelope = Math.min(1, t/.018) * Math.min(1, (duration-t)/.22) * Math.pow(1-u, .35);
    data[i] = Math.tanh(value*1.3) * envelope * .8;
  }
  return data;
}

class JutsuSounds {
  constructor(getStates) {
    this.getStates = getStates;
    this.enabled = false;
    this.enabling = false;
    this.context = null;
    this.master = null;
    this.buffers = {};
    this.playing = new Map();
    this.previous = {};
    this.lastPlayed = {};
    this._raw = {};
    this._rawSince = {};

    const unlock = () => this.enable();
    for (const event of ['click', 'touchend', 'keydown']) {
      document.addEventListener(event, unlock);
    }

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.stopAll();
        this.previous = {};
        this._raw = {};
      }
    });

    this.tick();
  }

  async enable() {
    if (this.enabling) return;
    if (this.enabled && this.context.state === 'running') return;
    this.enabling = true;
    try {
      if (!this.context) {
        const Audio = window.AudioContext || window.webkitAudioContext;
        this.context = new Audio();
        this.master = this.context.createGain();
        this.master.gain.value = 1;
        const limiter = this.context.createDynamicsCompressor();
        limiter.threshold.value = -10;
        limiter.ratio.value = 12;
        this.master.connect(limiter);
        limiter.connect(this.context.destination);

        // Synth clone + wood + katon fallback
        for (const key of ['clone', 'wood', 'katon']) {
          const samples = makeSynthSound(key, this.context.sampleRate);
          const buffer = this.context.createBuffer(1, samples.length, this.context.sampleRate);
          buffer.copyToChannel(samples, 0);
          this.buffers[key + '_synth'] = buffer;
        }
      }

      await this.context.resume();
      if (this.context.state !== 'running') throw new Error('Audio is suspended');
      await this.loadRecordings();
      this.enabled = true;
      this.previous = {};
      this.lastPlayed = {};
    } catch (error) {
      console.warn('Jutsu audio unavailable:', error);
    } finally {
      this.enabling = false;
    }
  }

  async loadRecordings() {
    // ⭐ ĐỔI: katon file = uchiha.mp3 (thay vì katon.mp3)
    const files = {
      naruto: 'assets/rasengan_last.mp3',
      sasuke: 'assets/chidori.mp3',
      katon:  'assets/uchiha.mp3'
    };

    await Promise.allSettled(Object.entries(files).map(async ([key, url]) => {
      if (this.buffers[key]) return;
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        this.buffers[key] = await this.context.decodeAudioData(await response.arrayBuffer());
      } catch (err) {
        console.warn(`[audio] ${key} fail: ${err.message} — dùng synth`);
        if (key === 'katon') this.buffers.katon = this.buffers.katon_synth;
      }
    }));
  }

  play(key, now) {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const buf = this.buffers[key];
    if (!buf) return;
    if (now - (this.lastPlayed[key] ?? -Infinity) < 1400) return;

    this.stop(key);
    this.lastPlayed[key] = now;

    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buf;
    source.connect(gain);
    gain.connect(this.master);

    const voice = { source, gain };
    this.playing.set(key, voice);
    source.onended = () => {
      try { source.disconnect(); gain.disconnect(); } catch (e) {}
      if (this.playing.get(key) === voice) this.playing.delete(key);
    };
    source.start();
  }

  stop(key) {
    const voice = this.playing.get(key);
    if (!voice) return;
    this.playing.delete(key);
    const t = this.context.currentTime;
    voice.gain.gain.cancelScheduledValues(t);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, t);
    voice.gain.gain.linearRampToValueAtTime(0, t + .06);
    try { voice.source.stop(t + .065); } catch (e) {}
  }

  stopAll() {
    for (const key of [...this.playing.keys()]) this.stop(key);
  }

  tick() {
    const states = this.getStates();
    const now = performance.now();

    if (!document.hidden) {
      for (const key of ['naruto', 'sasuke', 'katon', 'clone', 'wood']) {
        const on = !!states[key];

        if (this._raw[key] !== on) {
          this._raw[key] = on;
          this._rawSince[key] = now;
        }
        const threshold = on ? 100 : 200;
        const stable = (now - (this._rawSince[key] ?? 0)) >= threshold;
        const current = stable ? on : !!this.previous[key];

        if (current && !this.previous[key]) this.play(key, now);
        if (!current && this.previous[key]) this.stop(key);

        this.previous[key] = current;
      }
    }
    requestAnimationFrame(() => this.tick());
  }
}

window.JutsuSounds = JutsuSounds;