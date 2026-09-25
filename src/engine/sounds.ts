import type { SoundKind, SoundSettings } from './settings';

const CUSTOM_KEY = 'ph.customSound';
/** localStorage holds roughly 5M characters; base64 inflates by a third. */
export const MAX_CUSTOM_BYTES = 1_500_000;
const MAX_CUE_MS = 15_000;

export interface CustomSound {
  name: string;
  dataUrl: string;
}

export const SOUND_LABELS: Record<SoundKind, string> = {
  beep: 'Beep',
  triple: 'Triple beep',
  horn: 'Air horn',
  custom: 'Your file',
};

export function loadCustomSound(): CustomSound | null {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_KEY) ?? 'null');
  } catch {
    return null;
  }
}

export async function saveCustomSound(file: File): Promise<CustomSound> {
  if (!file.type.startsWith('audio/')) throw new Error('Choose an audio file (mp3, wav, ogg…)');
  if (file.size > MAX_CUSTOM_BYTES) throw new Error('Sound file must be 1.5 MB or smaller');
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  const sound = { name: file.name, dataUrl };
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(sound));
  } catch {
    throw new Error('Not enough browser storage for that file; try a smaller one');
  }
  return sound;
}

export function clearCustomSound(): void {
  localStorage.removeItem(CUSTOM_KEY);
}

let ctx: AudioContext | null = null;

/** Call from a click handler so browsers allow audio later without a gesture. */
export function unlockAudio(): void {
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
}

interface Note {
  at: number;
  dur: number;
  freqs: number[];
  wave: OscillatorType;
}

const PATTERNS: Record<Exclude<SoundKind, 'custom'>, Note[]> = {
  beep: [{ at: 0, dur: 0.45, freqs: [880], wave: 'sine' }],
  triple: [0, 0.25, 0.5].map((at) => ({ at, dur: 0.16, freqs: [1046], wave: 'square' as const })),
  horn: [
    { at: 0, dur: 0.35, freqs: [233, 294, 349], wave: 'sawtooth' },
    { at: 0.45, dur: 1.1, freqs: [233, 294, 349], wave: 'sawtooth' },
  ],
};

function playSynth(kind: Exclude<SoundKind, 'custom'>, volume: number): Promise<void> {
  unlockAudio();
  const ac = ctx!;
  const t0 = ac.currentTime + 0.02;
  const master = ac.createGain();
  master.gain.value = volume * 0.5;
  master.connect(ac.destination);
  let end = 0;
  for (const note of PATTERNS[kind]) {
    const env = ac.createGain();
    const start = t0 + note.at;
    const stop = start + note.dur;
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(1 / note.freqs.length, start + 0.015);
    env.gain.setValueAtTime(1 / note.freqs.length, stop - 0.04);
    env.gain.linearRampToValueAtTime(0, stop);
    env.connect(master);
    for (const f of note.freqs) {
      const osc = ac.createOscillator();
      osc.type = note.wave;
      osc.frequency.value = f;
      osc.connect(env);
      osc.start(start);
      osc.stop(stop);
    }
    end = Math.max(end, note.at + note.dur);
  }
  return new Promise((resolve) =>
    setTimeout(() => {
      master.disconnect();
      resolve();
    }, (end + 0.1) * 1000),
  );
}

function playFile(dataUrl: string, volume: number): Promise<void> {
  return new Promise((resolve) => {
    const audio = new Audio(dataUrl);
    audio.volume = volume;
    const done = () => {
      clearTimeout(cap);
      audio.pause();
      resolve();
    };
    const cap = setTimeout(done, MAX_CUE_MS);
    audio.onended = done;
    audio.onerror = done;
    audio.play().catch(done);
  });
}

/** Play the configured cue and resolve once it has finished (capped at 15 s). */
export function playCue(sound: SoundSettings): Promise<void> {
  if (sound.kind === 'custom') {
    const custom = loadCustomSound();
    return custom ? playFile(custom.dataUrl, sound.volume) : playSynth('beep', sound.volume);
  }
  return playSynth(sound.kind, sound.volume);
}
