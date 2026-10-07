import { create } from 'zustand';
import { readJson, writeJson } from '../lib/storage';
import { sfx } from '../lib/audio';

export interface Settings {
  sfx: boolean;
  music: boolean;
  reducedMotion: boolean;
  textScale: 1 | 1.15 | 1.3;
  colorblind: boolean;
  theme: string;
  diceSkin: string;
  consent: 'unknown' | 'all' | 'essential';
  mutedPlayers: string[];
}

const DEFAULTS: Settings = {
  sfx: true,
  music: false,
  reducedMotion: typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  textScale: 1,
  colorblind: false,
  theme: 'classic',
  diceSkin: 'ivory',
  consent: 'unknown',
  mutedPlayers: [],
};

interface SettingsState extends Settings {
  update(patch: Partial<Settings>): void;
}

export const useSettings = create<SettingsState>((set, get) => ({
  ...DEFAULTS,
  ...readJson<Partial<Settings>>('bt.settings', {}),
  update: (patch) => {
    const next = { ...get(), ...patch };
    const { update: _u, ...persist } = next;
    writeJson('bt.settings', persist);
    sfx.setSfxEnabled(next.sfx);
    sfx.setMusicEnabled(next.music);
    document.documentElement.style.setProperty('--text-scale', String(next.textScale));
    document.documentElement.dataset.reducedMotion = next.reducedMotion ? 'true' : 'false';
    document.documentElement.dataset.theme = next.theme;
    set(next);
  },
}));

/** Apply persisted settings to the document on boot. */
export function applySettingsToDocument(): void {
  const s = useSettings.getState();
  sfx.setSfxEnabled(s.sfx);
  document.documentElement.style.setProperty('--text-scale', String(s.textScale));
  document.documentElement.dataset.reducedMotion = s.reducedMotion ? 'true' : 'false';
  document.documentElement.dataset.theme = s.theme;
}
