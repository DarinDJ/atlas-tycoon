import { Modal, Toggle } from './ui/Modal';
import { useSettings } from '../store/useSettings';
import { LANGUAGES, useI18n, useT } from '../i18n';
import { DICE_SKINS, THEMES, isUnlocked } from '../config/cosmetics';
import { useEntitlements } from '../lib/useEntitlements';

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useSettings();
  const t = useT();
  const lang = useI18n((x) => x.lang);
  const setLang = useI18n((x) => x.setLang);
  const ents = useEntitlements();
  return (
    <Modal open={open} onClose={onClose} title={t('app.settings')} size="sm">
      <div className="flex flex-col gap-1">
        <label className="flex items-center justify-between gap-3 py-1.5 text-sm">
          {t('app.language')}
          <select
            className="input w-auto"
            value={lang}
            onChange={(e) => setLang(e.target.value as typeof lang)}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code} disabled={!l.ready}>
                {l.label}
                {l.ready ? '' : ' (soon)'}
              </option>
            ))}
          </select>
        </label>
        <Toggle id="set-sfx" label={t('app.sound')} checked={s.sfx} onChange={(v) => s.update({ sfx: v })} />
        <Toggle
          id="set-music"
          label={t('app.music')}
          checked={s.music}
          onChange={(v) => s.update({ music: v })}
        />
        <Toggle
          id="set-motion"
          label={t('app.reducedMotion')}
          checked={s.reducedMotion}
          onChange={(v) => s.update({ reducedMotion: v })}
        />
        <Toggle
          id="set-cb"
          label={t('app.colorblind')}
          checked={s.colorblind}
          onChange={(v) => s.update({ colorblind: v })}
        />
        <label className="flex items-center justify-between gap-3 py-1.5 text-sm">
          {t('app.textSize')}
          <select
            className="input w-auto"
            value={s.textScale}
            onChange={(e) => s.update({ textScale: Number(e.target.value) as 1 | 1.15 | 1.3 })}
          >
            <option value={1}>A</option>
            <option value={1.15}>A+</option>
            <option value={1.3}>A++</option>
          </select>
        </label>
        <label className="flex items-center justify-between gap-3 py-1.5 text-sm">
          {t('app.theme')}
          <select
            className="input w-auto"
            value={s.theme}
            onChange={(e) => s.update({ theme: e.target.value })}
          >
            {THEMES.map((th) => (
              <option key={th.id} value={th.id} disabled={!isUnlocked(th, ents)}>
                {th.name}
                {isUnlocked(th, ents) ? '' : ' 🔒'}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center justify-between gap-3 py-1.5 text-sm">
          Dice
          <select
            className="input w-auto"
            value={s.diceSkin}
            onChange={(e) => s.update({ diceSkin: e.target.value })}
          >
            {DICE_SKINS.map((d) => (
              <option key={d.id} value={d.id} disabled={!isUnlocked(d, ents)}>
                {d.name}
                {isUnlocked(d, ents) ? '' : ' 🔒'}
              </option>
            ))}
          </select>
        </label>
      </div>
    </Modal>
  );
}
