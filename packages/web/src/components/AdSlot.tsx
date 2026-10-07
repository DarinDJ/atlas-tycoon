import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSettings } from '../store/useSettings';
import { useT } from '../i18n';

interface Props {
  /** Where the slot lives; never 'board'. */
  placement: 'lobby' | 'results' | 'home';
  /** From /api/config. */
  enabled: boolean;
  entitlements?: string[];
  className?: string;
}

/**
 * Ad slot designed for AdSense/AdMob-style tags. Renders nothing unless ads are enabled in server config,
 * the user gave consent, and they do not own the no-ads pass. Replace the placeholder with the ad tag
 * (see README "Ads") — keep the fixed height to avoid layout shift.
 */
export function AdSlot({ placement, enabled, entitlements = [], className = '' }: Props) {
  const consent = useSettings((s) => s.consent);
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const show = enabled && consent === 'all' && !entitlements.includes('no-ads');
  useEffect(() => {
    if (!show || loaded || !ref.current) return;
    // TODO(ads): inject the real tag here, e.g. (window.adsbygoogle = window.adsbygoogle || []).push({});
    setLoaded(true);
  }, [show, loaded]);
  if (!show) return null;
  return (
    <div
      className={`panel flex min-h-[90px] flex-col items-center justify-center gap-1 p-2 text-center ${className}`}
      data-ad-placement={placement}
      ref={ref}
    >
      <span className="text-[10px] uppercase tracking-wide opacity-50">{t('ads.label')}</span>
      <div className="h-[50px] w-full max-w-[320px] rounded bg-gray-100" aria-hidden />
      <Link to="/store" className="text-xs underline opacity-70">
        {t('ads.remove')}
      </Link>
    </div>
  );
}
