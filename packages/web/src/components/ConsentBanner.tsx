import { useLocation } from 'react-router-dom';
import { useSettings } from '../store/useSettings';
import { useT } from '../i18n';

/** GDPR / DPDP consent. Ads and non-essential analytics only load after "Accept". */
export function ConsentBanner() {
  const consent = useSettings((s) => s.consent);
  const update = useSettings((s) => s.update);
  const t = useT();
  const { pathname } = useLocation();
  // Never cover the game controls; ads only appear outside the board anyway.
  if (consent !== 'unknown' || pathname.startsWith('/room/')) return null;
  return (
    <div
      role="region"
      aria-label="Cookie consent"
      className="fixed inset-x-2 bottom-[calc(var(--safe-bottom)+0.5rem)] z-50 mx-auto max-w-xl rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] p-4 shadow-xl"
    >
      <p className="mb-3 text-sm">
        {t('consent.text')}{' '}
        <a href="/how-to-play#privacy" className="underline">
          Privacy
        </a>
      </p>
      <div className="flex gap-2">
        <button className="btn btn-primary btn-sm" onClick={() => update({ consent: 'all' })}>
          {t('consent.accept')}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => update({ consent: 'essential' })}>
          {t('consent.essential')}
        </button>
      </div>
    </div>
  );
}

export function hasAdConsent(): boolean {
  return useSettings.getState().consent === 'all';
}
