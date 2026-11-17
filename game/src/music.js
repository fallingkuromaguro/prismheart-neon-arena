// The score: a small step sequencer playing an original minor-key loop (i-VI-III-VII in A minor),
// built from layers that fade in as the night gets harder: pad and bass on the title, then kick,
// arpeggio, hats, and a driving octave bass for the guardians.
const BPM = 112;
const STEP_TIME = 60 / BPM / 4;
const LOOKAHEAD = 0.12;
/** Chord roots (MIDI) per bar and the chord tones above each. */
const BARS = [
  { root: 45, tones: [57, 60, 64, 69] },
  { root: 41, tones: [53, 57, 60, 65] },
  { root: 48, tones: [55, 60, 64, 67] },
  { root: 43, tones: [55, 59, 62, 67] },
];
const ARP = [0, 1, 2, 3, 2, 1, 2, 3, 0, 2, 1, 3, 2, 3, 1, 2];

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

export function createMusic(ctx, destination) {
  const bus = ctx.createGain();
  bus.gain.value = 0.32;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1400;
  bus.connect(filter).connect(destination);
  let intensity = 0;
  let step = 0;
  let nextTime = ctx.currentTime + 0.1;

  function note(freq, at, dur, type, vol, cutoff = 0) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    let out = o;
    if (cutoff) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(cutoff, at);
      f.frequency.exponentialRampToValueAtTime(cutoff * 0.3, at + dur);
      o.connect(f);
      out = f;
    }
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    out.connect(g).connect(bus);
    o.start(at);
    o.stop(at + dur + 0.05);
  }

  function kick(at) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(150, at);
    o.frequency.exponentialRampToValueAtTime(40, at + 0.15);
    g.gain.setValueAtTime(0.7, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
    o.connect(g).connect(bus);
    o.start(at);
    o.stop(at + 0.25);
  }

  function hat(at, vol) {
    const len = Math.floor(ctx.sampleRate * 0.05);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(bus);
    src.start(at);
  }

  function schedule(s, at) {
    const bar = BARS[Math.floor(s / 16) % BARS.length];
    const i = s % 16;
    if (i === 0) for (const t of bar.tones) note(midi(t), at, STEP_TIME * 16, 'triangle', 0.035);
    if (intensity >= 4) {
      if (i % 2 === 0) note(midi(bar.root - 12 + (i % 4 === 2 ? 12 : 0)), at, STEP_TIME * 1.6, 'sawtooth', 0.12, 900);
    } else if (i % 4 === 0 || (intensity >= 2 && i % 4 === 3)) note(midi(bar.root - 12), at, STEP_TIME * 3, 'sawtooth', 0.1, 600 + intensity * 250);
    if (intensity >= 1 && i % 4 === 0) kick(at);
    if (intensity >= 2) note(midi(bar.tones[ARP[i]] + 12), at, STEP_TIME * 0.9, 'square', 0.025, 2600);
    if (intensity >= 3 && i % 2 === 1) hat(at, 0.12);
    if (intensity >= 4 && i === 8) note(midi(bar.tones[3] + 12), at, STEP_TIME * 8, 'sawtooth', 0.03, 2000);
  }

  setInterval(() => {
    if (ctx.state !== 'running') {
      nextTime = ctx.currentTime + 0.1;
      return;
    }
    while (nextTime < ctx.currentTime + LOOKAHEAD) {
      schedule(step, nextTime);
      step += 1;
      nextTime += STEP_TIME;
    }
  }, 30);

  return {
    setIntensity(level) {
      intensity = level;
      filter.frequency.setTargetAtTime(level === 0 ? 1100 : 2400 + level * 900, ctx.currentTime, 0.4);
    },
  };
}
