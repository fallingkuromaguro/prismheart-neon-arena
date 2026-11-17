// Every sound is synthesised here with WebAudio: no sound files. The context starts on the first
// click or key (browsers require a gesture); before that, and when muted, play() does nothing.
import { createMusic } from './music.js';

export function createAudio() {
  let ctx = null;
  let master = null;
  let sfx = null;
  let noise = null;
  let muted = false;
  let music = null;
  const last = {};

  function unlock() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.8;
    master.connect(comp).connect(ctx.destination);
    sfx = ctx.createGain();
    sfx.gain.value = 0.55;
    sfx.connect(master);
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    music = createMusic(ctx, master);
  }

  /** One enveloped oscillator, optionally sliding to another pitch. */
  function tone(freq, dur, { type = 'sine', vol = 0.2, to = null, attack = 0.004, at = 0, dest = sfx } = {}) {
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** Filtered white noise: explosions, whooshes, impacts. */
  function hiss(dur, { vol = 0.2, freq = 1200, to = null, type = 'lowpass', q = 0.8, at = 0 } = {}) {
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(sfx);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  /** Limit how often a sound may start, so a storm of hits stays a texture, not a wall. */
  function gate(name, gap) {
    const now = ctx.currentTime;
    if (last[name] !== undefined && now - last[name] < gap) return false;
    last[name] = now;
    return true;
  }

  const SOUNDS = {
    shoot: () => gate('shoot', 0.05) && tone(1250 + Math.random() * 120, 0.06, { type: 'square', vol: 0.035, to: 520 }),
    sentry: () => gate('sentry', 0.08) && tone(1700, 0.05, { type: 'triangle', vol: 0.04, to: 900 }),
    hit: () => gate('hit', 0.03) && tone(420, 0.05, { type: 'triangle', vol: 0.06, to: 200 }),
    kill: (e) => {
      if (!gate('kill', 0.025)) return;
      hiss(0.22, { vol: 0.2, freq: 2600, to: 240 });
      tone(180 + Math.min(e.combo ?? 0, 40) * 8, 0.16, { type: 'sine', vol: 0.18, to: 60 });
    },
    bigKill: () => {
      hiss(0.6, { vol: 0.35, freq: 1800, to: 90 });
      tone(110, 0.5, { type: 'sawtooth', vol: 0.15, to: 30 });
    },
    shard: (e) => gate('shard', 0.03) && tone(880 + ((e.n ?? 0) % 12) * 45, 0.07, { type: 'sine', vol: 0.06, to: 1600 }),
    dash: () => {
      hiss(0.18, { vol: 0.22, freq: 500, to: 3200, type: 'bandpass', q: 1.5 });
      tone(300, 0.12, { type: 'sine', vol: 0.08, to: 900 });
    },
    lunge: () => gate('lunge', 0.1) && hiss(0.2, { vol: 0.1, freq: 900, to: 2400, type: 'bandpass', q: 3 }),
    enemyShot: () => gate('eshot', 0.06) && tone(520, 0.12, { type: 'sine', vol: 0.06, to: 320 }),
    bossShot: () => gate('bshot', 0.1) && tone(300, 0.25, { type: 'triangle', vol: 0.1, to: 150 }),
    latch: () => tone(160, 0.3, { type: 'sawtooth', vol: 0.06, to: 90 }),
    playerHit: () => {
      tone(240, 0.35, { type: 'sawtooth', vol: 0.22, to: 50 });
      hiss(0.3, { vol: 0.3, freq: 3000, to: 200 });
    },
    heartHit: () => gate('heart', 0.22) && tone(130, 0.28, { type: 'sine', vol: 0.22, to: 70 }),
    pulseReady: () => [0, 0.08, 0.16].forEach((at, i) => tone([660, 880, 1320][i], 0.25, { type: 'triangle', vol: 0.08, at })),
    pulse: () => {
      tone(70, 1.1, { type: 'sine', vol: 0.5, to: 28 });
      hiss(1, { vol: 0.25, freq: 6000, to: 400, type: 'highpass' });
      [440, 554, 659, 880].forEach((f, i) => tone(f, 0.9, { type: 'triangle', vol: 0.05, at: i * 0.03 }));
    },
    waveStart: (e) => {
      const notes = e.boss ? [110, 104, 98] : [440, 523, 659];
      notes.forEach((f, i) => tone(f, e.boss ? 0.6 : 0.22, { type: e.boss ? 'sawtooth' : 'triangle', vol: e.boss ? 0.12 : 0.08, at: i * (e.boss ? 0.3 : 0.1) }));
    },
    waveClear: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.35, { type: 'triangle', vol: 0.09, at: i * 0.09 })),
    upgradeOffer: () => tone(1046, 0.4, { type: 'sine', vol: 0.06 }),
    upgrade: () => {
      tone(784, 0.2, { type: 'triangle', vol: 0.1 });
      tone(1175, 0.35, { type: 'triangle', vol: 0.1, at: 0.08 });
    },
    bossSpawn: () => {
      tone(55, 2, { type: 'sawtooth', vol: 0.18, to: 41 });
      hiss(1.5, { vol: 0.15, freq: 300, to: 1200, type: 'bandpass', q: 2 });
    },
    bossPhase: () => {
      tone(82, 1.2, { type: 'sawtooth', vol: 0.2, to: 41 });
      hiss(0.8, { vol: 0.3, freq: 4000, to: 200 });
    },
    bossDeath: () => {
      hiss(2.2, { vol: 0.45, freq: 3000, to: 60 });
      tone(220, 1.8, { type: 'sawtooth', vol: 0.2, to: 30 });
      [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.8, { type: 'triangle', vol: 0.07, at: 0.5 + i * 0.12 }));
    },
    dying: () => {
      hiss(2.5, { vol: 0.5, freq: 2000, to: 40 });
      tone(160, 2.2, { type: 'sawtooth', vol: 0.25, to: 25 });
    },
    gameover: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.7, { type: 'triangle', vol: 0.1, at: i * 0.28 })),
    victory: () => [523, 659, 784, 659, 784, 1046].forEach((f, i) => tone(f, i === 5 ? 1.4 : 0.3, { type: 'triangle', vol: 0.11, at: i * 0.16 })),
    ui: () => tone(990, 0.06, { type: 'square', vol: 0.03 }),
    start: () => [330, 440, 660, 880].forEach((f, i) => tone(f, 0.3, { type: 'triangle', vol: 0.08, at: i * 0.06 })),
  };

  return {
    unlock,
    play(name, event = {}) {
      if (!ctx || muted || ctx.state !== 'running') return;
      const sound = SOUNDS[name];
      if (sound) sound(event);
    },
    /** 0 title, 1-3 rising with the fight, 4 boss. */
    setIntensity(level) {
      if (music) music.setIntensity(level);
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.setTargetAtTime(muted ? 0 : 0.8, ctx.currentTime, 0.05);
    },
    get muted() {
      return muted;
    },
  };
}
