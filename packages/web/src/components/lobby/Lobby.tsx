import type { HouseRules } from '@bt/engine';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BRAND } from '../../config/brand';
import { Pawn } from '../Pawn';
import { mapName, useI18n, useT } from '../../i18n';
import type { MapSummary } from '../../lib/api';
import { whatsappUrl } from '../../lib/shareCard';
import { useGame, type RoomView } from '../../store/useGame';
import { Toggle } from '../ui/Modal';
import { AdSlot } from '../AdSlot';

interface Props {
  room: RoomView;
  me: string | null;
  mapSummary: MapSummary | null;
  adsEnabled: boolean;
  entitlements: string[];
  autostart?: boolean;
}

export function Lobby({ room, me, mapSummary, adsEnabled, entitlements, autostart }: Props) {
  const t = useT();
  const lang = useI18n((s) => s.lang);
  const nav = useNavigate();
  const emit = useGame((s) => s.emit);
  const leave = useGame((s) => s.leaveRoom);
  const toast = useGame((s) => s.toast);
  const isHost = !!me && room.hostId === me;
  const [rules, setRules] = useState<HouseRules>(room.rules);
  const [copied, setCopied] = useState(false);
  const url = `${location.origin}/room/${room.code}`;
  const inviteText = t('lobby.inviteText', { game: BRAND.name, code: room.code, url });

  useEffect(() => setRules(room.rules), [room.rules]);
  useEffect(() => {
    if (autostart && isHost && room.status === 'lobby') {
      void emit('room:start');
      // Drop the flag so "Play again" returns to the lobby instead of auto-starting again.
      nav(`/room/${room.code}`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autostart, isHost]);

  const update = (patch: Partial<HouseRules>) => {
    const next = { ...rules, ...patch };
    setRules(next);
    void emit('room:settings', patch).then((r) => {
      if (!r.ok) toast('error', r.message);
    });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast('info', url);
    }
  };

  const share = async () => {
    const nav2 = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav2.share) {
      try {
        await nav2.share({ title: BRAND.name, text: inviteText, url });
        return;
      } catch {
        /* cancelled */
      }
    }
    await copy();
  };

  const Num = ({
    k,
    label,
    step = 1,
    min = 0,
    max = 100000,
  }: {
    k: keyof HouseRules;
    label: string;
    step?: number;
    min?: number;
    max?: number;
  }) => (
    <label className="flex items-center justify-between gap-3 py-1 text-sm">
      {label}
      <input
        type="number"
        className="input w-28"
        disabled={!isHost}
        value={Number(rules[k])}
        min={min}
        max={max}
        step={step}
        onChange={(e) => update({ [k]: Number(e.target.value) } as Partial<HouseRules>)}
      />
    </label>
  );
  const Bool = ({ k, label }: { k: keyof HouseRules; label: string }) => (
    <Toggle
      id={`rule-${k}`}
      label={label}
      checked={!!rules[k]}
      onChange={(v) => isHost && update({ [k]: v } as Partial<HouseRules>)}
    />
  );

  return (
    <main
      id="main"
      className="mx-auto flex max-w-5xl flex-col gap-4 px-4 pt-[calc(var(--safe-top)+1rem)] pb-16"
      data-testid="lobby"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-black">{t('lobby.title', { code: room.code })}</h1>
          <p className="text-sm opacity-70">
            {t('lobby.map')}:{' '}
            {mapSummary ? `${mapSummary.flag ?? ''} ${mapName(mapSummary, lang)}` : room.mapId}
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-secondary btn-sm" onClick={() => void copy()}>
            🔗 {copied ? t('app.copied') : t('lobby.copyLink')}
          </button>
          <a
            className="btn btn-sm text-white"
            style={{ background: '#25D366' }}
            href={whatsappUrl(inviteText)}
            target="_blank"
            rel="noreferrer"
            data-testid="whatsapp"
          >
            💬 {t('lobby.whatsapp')}
          </a>
          <button className="btn btn-secondary btn-sm" onClick={() => void share()}>
            📤 {t('app.share')}
          </button>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="panel p-4">
          <h2 className="mb-2 text-sm font-bold">
            {t('lobby.players')} ({room.seats.length}/{room.rules.maxPlayers})
          </h2>
          <ul className="flex flex-col gap-1.5" data-testid="seats">
            {room.seats.map((s) => (
              <li
                key={s.playerId}
                className="flex items-center gap-2 rounded-xl bg-[var(--panel-muted)] px-2 py-1.5"
                style={{ borderLeft: `5px solid ${s.color}` }}
              >
                <Pawn avatar={s.avatar} color={s.color} skin={s.token} size={34} />
                <span className="flex-1 truncate font-semibold">
                  {s.name}
                  {s.playerId === me && <span className="ml-1 text-xs opacity-60">({t('app.you')})</span>}
                </span>
                {s.isHost && (
                  <span className="rounded bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] px-1.5 text-[10px] font-bold uppercase text-[var(--accent)]">
                    {t('lobby.host')}
                  </span>
                )}
                {s.isBot && (
                  <span className="text-xs opacity-70">
                    🤖 {t(`lobby.${s.botLevel ?? 'medium'}` as 'lobby.easy')}
                  </span>
                )}
                {!s.connected && !s.isBot && <span>🔌</span>}
                {isHost && s.playerId !== me && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() =>
                      void emit(s.isBot ? 'room:removeBot' : 'room:kick', { playerId: s.playerId })
                    }
                    aria-label={t('lobby.remove')}
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
          {isHost && room.seats.length < room.rules.maxPlayers && (
            <div className="mt-3 flex flex-wrap gap-2">
              {(['easy', 'medium', 'hard'] as const).map((lvl) => (
                <button
                  key={lvl}
                  className="btn btn-secondary btn-sm"
                  data-testid={`add-bot-${lvl}`}
                  onClick={() => void emit('room:addBot', { level: lvl })}
                >
                  🤖 {t('lobby.addBot')} · {t(`lobby.${lvl}`)}
                </button>
              ))}
            </div>
          )}
          <div className="mt-4 flex gap-2">
            {isHost ? (
              <button
                className="btn btn-primary flex-1"
                data-testid="start-game"
                disabled={room.seats.length < 2}
                onClick={() => void emit('room:start').then((r) => !r.ok && toast('error', r.message))}
              >
                ▶️ {t('lobby.start')}
              </button>
            ) : (
              <p className="flex-1 self-center text-sm opacity-70">
                {me ? t('lobby.waiting') : t('lobby.spectating')}
              </p>
            )}
            <button
              className="btn btn-ghost"
              onClick={() => {
                void leave();
                nav('/');
              }}
            >
              {t('lobby.leave')}
            </button>
          </div>
          <AdSlot placement="lobby" enabled={adsEnabled} entitlements={entitlements} className="mt-3" />
        </section>

        <section className="panel p-4">
          <h2 className="mb-1 text-sm font-bold">{t('lobby.rules')}</h2>
          <div className="flex flex-col divide-y divide-[var(--panel-border)]">
            <Num k="maxPlayers" label={t('lobby.maxPlayers')} min={2} max={8} />
            <Num k="startingCash" label={t('lobby.startingCash')} step={50} min={100} />
            <Num k="salary" label={t('lobby.salary')} step={10} />
            <Num k="turnTimerSeconds" label={t('lobby.turnTimer')} step={15} max={600} />
            <Num k="timeLimitMinutes" label={t('lobby.timeLimit')} step={5} max={240} />
            <Bool k="doubleRentOnFullSet" label={t('lobby.doubleRent')} />
            <Bool k="auctionEnabled" label={t('lobby.auction')} />
            <Bool k="freeParkingJackpot" label={t('lobby.jackpot')} />
            <Bool k="evenBuild" label={t('lobby.evenBuild')} />
            <Bool k="noRentInJail" label={t('lobby.noRentInJail')} />
            <Bool k="randomizeTurnOrder" label={t('lobby.randomOrder')} />
            <Bool k="actionsAnytime" label={t('lobby.actionsAnytime')} />
            <Bool k="voteKickEnabled" label={t('lobby.voteKick')} />
            <Bool k="isPrivate" label={t('lobby.private')} />
            <label className="flex items-center justify-between gap-3 py-1.5 text-sm">
              {t('lobby.fillBots')}
              <select
                className="input w-32"
                disabled={!isHost}
                value={rules.fillWithBots ?? ''}
                onChange={(e) =>
                  update({ fillWithBots: (e.target.value || null) as HouseRules['fillWithBots'] })
                }
              >
                <option value="">{t('lobby.none')}</option>
                <option value="easy">{t('lobby.easy')}</option>
                <option value="medium">{t('lobby.medium')}</option>
                <option value="hard">{t('lobby.hard')}</option>
              </select>
            </label>
          </div>
        </section>
      </div>
    </main>
  );
}
