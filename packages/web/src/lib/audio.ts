/**
 * Tiny synthesized sound set (no audio files to download). All sounds are short Web Audio
 * envelopes; music is a procedural pentatonic loop. Respects the mute settings.
 */
let ctx: AudioContext | null = null;
let musicTimer: number | null = null;
let musicGain: GainNode | null = null;
let enabledSfx = true;
let enabledMusic = false;

function ac(): AudioContext | null {
  try {
    if (!ctx)
      ctx = new (
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      )();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(
  freq: number,
  dur: number,
  type: OscillatorType = 'sine',
  gain = 0.15,
  delay = 0,
  slideTo?: number,
): void {
  const c = ac();
  if (!c || !enabledSfx) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  const t0 = c.currentTime + delay;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(dur: number, gain = 0.08, delay = 0): void {
  const c = ac();
  if (!c || !enabledSfx) return;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.value = gain;
  const f = c.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 1200;
  src.connect(f).connect(g).connect(c.destination);
  src.start(c.currentTime + delay);
}

export type SoundName =
  | 'dice'
  | 'move'
  | 'cash'
  | 'pay'
  | 'buy'
  | 'card'
  | 'jail'
  | 'build'
  | 'win'
  | 'lose'
  | 'click'
  | 'notify'
  | 'auction'
  | 'trade';

export const sfx = {
  play(name: SoundName): void {
    switch (name) {
      case 'dice':
        for (let i = 0; i < 5; i++) noise(0.05, 0.12, i * 0.07);
        tone(220, 0.08, 'triangle', 0.08, 0.36);
        break;
      case 'move':
        tone(660, 0.05, 'square', 0.05);
        break;
      case 'cash':
        tone(880, 0.08, 'sine', 0.12);
        tone(1320, 0.12, 'sine', 0.12, 0.08);
        break;
      case 'pay':
        tone(440, 0.12, 'sawtooth', 0.08, 0, 220);
        break;
      case 'buy':
        tone(523, 0.1, 'triangle', 0.12);
        tone(659, 0.1, 'triangle', 0.12, 0.1);
        tone(784, 0.18, 'triangle', 0.12, 0.2);
        break;
      case 'card':
        noise(0.12, 0.06);
        tone(988, 0.15, 'sine', 0.08, 0.05);
        break;
      case 'jail':
        tone(196, 0.3, 'square', 0.1, 0, 98);
        noise(0.2, 0.1, 0.1);
        break;
      case 'build':
        tone(330, 0.06, 'square', 0.08);
        tone(330, 0.06, 'square', 0.08, 0.09);
        tone(440, 0.1, 'square', 0.08, 0.18);
        break;
      case 'win':
        [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.25, 'triangle', 0.14, i * 0.12));
        break;
      case 'lose':
        [392, 349, 311, 262].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.08, i * 0.18));
        break;
      case 'click':
        tone(1200, 0.03, 'sine', 0.05);
        break;
      case 'notify':
        tone(1047, 0.1, 'sine', 0.1);
        tone(1319, 0.14, 'sine', 0.1, 0.1);
        break;
      case 'auction':
        tone(740, 0.08, 'square', 0.07);
        tone(740, 0.08, 'square', 0.07, 0.12);
        break;
      case 'trade':
        tone(587, 0.1, 'triangle', 0.1);
        tone(880, 0.16, 'triangle', 0.1, 0.1);
        break;
    }
  },
  setSfxEnabled(v: boolean): void {
    enabledSfx = v;
  },
  setMusicEnabled(v: boolean): void {
    enabledMusic = v;
    if (v) startMusic();
    else stopMusic();
  },
  unlock(): void {
    ac();
  },
};

const SCALE = [261.6, 293.7, 329.6, 392.0, 440.0, 523.3, 587.3, 659.3];

function startMusic(): void {
  const c = ac();
  if (!c || musicTimer !== null) return;
  musicGain = c.createGain();
  musicGain.gain.value = 0.05;
  musicGain.connect(c.destination);
  let step = 0;
  const bar = [0, 2, 4, 7, 4, 2, 5, 3];
  musicTimer = window.setInterval(() => {
    if (!enabledMusic || !c || !musicGain) return;
    const idx = (bar[step % bar.length]! + (Math.floor(step / 16) % 2) * 1) % SCALE.length;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = step % 4 === 0 ? 'triangle' : 'sine';
    o.frequency.value = SCALE[idx]! / (step % 8 === 0 ? 2 : 1);
    const t0 = c.currentTime;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(1, t0 + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45);
    o.connect(g).connect(musicGain);
    o.start(t0);
    o.stop(t0 + 0.5);
    step++;
  }, 280);
}

function stopMusic(): void {
  if (musicTimer !== null) window.clearInterval(musicTimer);
  musicTimer = null;
  musicGain?.disconnect();
  musicGain = null;
}
