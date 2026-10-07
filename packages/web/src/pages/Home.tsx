import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BRAND } from '../config/brand';
import { AVATARS, TOKENS, glyphFor, isUnlocked } from '../config/cosmetics';
import { mapName, useI18n, useT } from '../i18n';
import { api, type AppConfig, type PublicRoom } from '../lib/api';
import { getProfile, saveProfile, type Profile } from '../lib/storage';
import { useEntitlements } from '../lib/useEntitlements';
import { useGame } from '../store/useGame';
import { SettingsDialog } from '../components/SettingsDialog';
import { AdSlot } from '../components/AdSlot';
import { sfx } from '../lib/audio';

export function ProfileEditor({ profile, onChange }: { profile: Profile; onChange(p: Profile): void }) {
  const t = useT();
  const ents = useEntitlements();
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm font-semibold">
        {t('home.yourName')}
        <input
          className="input"
          value={profile.name}
          maxLength={16}
          placeholder={t('home.namePlaceholder')}
          onChange={(e) => onChange({ ...profile, name: e.target.value })}
          data-testid="name-input"
          autoComplete="nickname"
        />
      </label>
      <div className="text-sm font-semibold">{t('home.avatar')}</div>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('home.avatar')}>
        {AVATARS.map((a) => {
          const locked = !isUnlocked(a, ents);
          return (
            <button
              key={a.id}
              role="radio"
              aria-checked={profile.avatar === a.id}
              disabled={locked}
              title={a.name}
              className={`h-10 w-10 rounded-xl text-xl transition focus-ring ${profile.avatar === a.id ? 'bg-saffron/25 ring-2 ring-saffron' : 'bg-black/5'} ${locked ? 'opacity-40' : ''}`}
              onClick={() => onChange({ ...profile, avatar: a.id })}
            >
              {a.glyph}
            </button>
          );
        })}
      </div>
      <div className="text-sm font-semibold">{t('home.token')}</div>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('home.token')}>
        {TOKENS.map((a) => {
          const locked = !isUnlocked(a, ents);
          return (
            <button
              key={a.id}
              role="radio"
              aria-checked={profile.token === a.id}
              disabled={locked}
              title={a.name}
              className={`h-10 w-10 rounded-xl text-xl transition focus-ring ${profile.token === a.id ? 'bg-leaf/20 ring-2 ring-leaf' : 'bg-black/5'} ${locked ? 'opacity-40' : ''}`}
              onClick={() => onChange({ ...profile, token: a.id })}
            >
              {a.glyph}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function Home() {
  const t = useT();
  const lang = useI18n((s) => s.lang);
  const nav = useNavigate();
  const [profile, setProfile] = useState<Profile>(getProfile);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [mapId, setMapId] = useState('india-cities');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [daily, setDaily] = useState<Record<string, number> | null>(null);
  const lobby = useGame((s) => s.lobby);
  const subscribeLobby = useGame((s) => s.subscribeLobby);
  const createRoom = useGame((s) => s.createRoom);
  const joinRoom = useGame((s) => s.joinRoom);
  const quickMatch = useGame((s) => s.quickMatch);
  const toast = useGame((s) => s.toast);
  const connected = useGame((s) => s.connected);
  const ents = useEntitlements();

  useEffect(() => {
    saveProfile(profile);
  }, [profile]);
  useEffect(() => {
    void api
      .config()
      .then(setConfig)
      .catch(() => toast('error', t('err.generic')));
    void api
      .me()
      .then((m) => setDaily(m.daily))
      .catch(() => undefined);
  }, [toast, t]);
  useEffect(() => {
    if (!connected) return;
    subscribeLobby(true);
    return () => subscribeLobby(false);
  }, [connected, subscribeLobby]);

  const ensureName = (): boolean => {
    if (profile.name.trim().length < 2) {
      toast('error', t('home.yourName'));
      document.querySelector<HTMLInputElement>('[data-testid=name-input]')?.focus();
      return false;
    }
    return true;
  };

  const go = async (kind: 'create' | 'join' | 'quick' | 'bots', joinCode?: string) => {
    if (!ensureName()) return;
    sfx.unlock();
    setBusy(kind);
    let res;
    if (kind === 'create') res = await createRoom(mapId, {});
    else if (kind === 'bots')
      res = await createRoom(mapId, { fillWithBots: 'medium', maxPlayers: 4, isPrivate: true });
    else if (kind === 'quick') res = await quickMatch(mapId);
    else res = await joinRoom((joinCode ?? code).trim().toUpperCase());
    setBusy(null);
    if (!res.ok) {
      toast('error', res.message);
      return;
    }
    nav(`/room/${res.data.code}${kind === 'bots' ? '?autostart=1' : ''}`);
  };

  const maps = config?.maps ?? [];
  const selectedMap = maps.find((m) => m.id === mapId);
  const mapLocked = !!selectedMap?.premium && !ents.includes(selectedMap.id) && !ents.includes('map-all');

  return (
    <main
      id="main"
      className="mx-auto flex w-full max-w-5xl flex-col gap-6 overflow-x-hidden px-4 pt-[calc(var(--safe-top)+1rem)] pb-16"
    >
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-black tracking-tight text-saffron-dark sm:text-4xl">
            {t('home.title')}
          </h1>
          <p className="text-sm opacity-70">{t('home.subtitle')}</p>
        </div>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => setSettingsOpen(true)}
          aria-label={t('app.settings')}
        >
          ⚙️
        </button>
      </header>

      <div className="grid gap-6 md:grid-cols-[1.1fr_1fr]">
        <section className="panel flex flex-col gap-4 p-4">
          <ProfileEditor profile={profile} onChange={setProfile} />

          <div>
            <div className="mb-2 text-sm font-semibold">{t('home.chooseMap')}</div>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin" role="radiogroup">
              {maps.map((m) => {
                const locked = m.premium && !ents.includes(m.id) && !ents.includes('map-all');
                return (
                  <button
                    key={m.id}
                    role="radio"
                    aria-checked={mapId === m.id}
                    onClick={() => setMapId(m.id)}
                    className={`relative min-w-[9rem] shrink-0 rounded-xl p-3 text-left text-white shadow transition focus-ring ${mapId === m.id ? 'ring-4 ring-saffron' : 'opacity-90'}`}
                    style={{
                      background:
                        m.theme.centerGradient ??
                        `linear-gradient(135deg, ${m.theme.primary}, ${m.theme.secondary})`,
                    }}
                    data-testid={`map-${m.id}`}
                  >
                    <div className="text-2xl">{m.flag ?? '🗺️'}</div>
                    <div className="text-sm leading-tight font-bold drop-shadow">{mapName(m, lang)}</div>
                    <div className="text-[10px] opacity-90 drop-shadow">{m.properties} properties</div>
                    {locked && (
                      <span className="absolute top-2 right-2 rounded bg-black/60 px-1.5 text-[10px]">
                        🔒 {t('app.premium')}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {selectedMap && (
              <p className="mt-1 text-xs opacity-70">
                {selectedMap.tagline}{' '}
                <Link to={`/play/${selectedMap.id}`} className="underline">
                  ↗
                </Link>
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              className="btn btn-primary"
              disabled={!!busy || mapLocked}
              onClick={() => void go('create')}
              data-testid="create-room"
            >
              ➕ {t('home.createRoom')}
            </button>
            <button
              className="btn btn-secondary"
              disabled={!!busy || mapLocked}
              onClick={() => void go('bots')}
              data-testid="play-bots"
            >
              🤖 {t('home.playBots')}
            </button>
            <button className="btn btn-secondary" disabled={!!busy} onClick={() => void go('quick')}>
              ⚡ {t('home.quickMatch')}
            </button>
            <form
              className="flex gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                void go('join');
              }}
            >
              <input
                className="input min-w-0 uppercase"
                placeholder={t('home.roomCode')}
                value={code}
                maxLength={8}
                onChange={(e) => setCode(e.target.value)}
                aria-label={t('home.roomCode')}
                data-testid="join-code"
              />
              <button className="btn btn-secondary" type="submit" disabled={!!busy || code.trim().length < 4}>
                {t('home.join')}
              </button>
            </form>
          </div>
          {mapLocked && (
            <p className="text-xs text-red-700">
              {t('err.MAP_LOCKED')}.{' '}
              <Link to="/store" className="underline">
                {t('home.store')}
              </Link>
            </p>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <div className="panel p-4">
            <h2 className="mb-2 text-sm font-bold">{t('home.publicRooms')}</h2>
            {lobby.length === 0 ? (
              <p className="text-sm opacity-60">{t('home.noRooms')}</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {lobby.map((r: PublicRoom) => (
                  <li
                    key={r.code}
                    className="flex items-center justify-between gap-2 rounded-lg bg-black/5 px-2 py-1.5 text-sm"
                  >
                    <span>
                      <b>{r.hostName}</b> · {maps.find((m) => m.id === r.mapId)?.flag ?? ''}{' '}
                      {t('home.players', { n: `${r.players}/${r.maxPlayers}` })}
                      {r.bots > 0 && ` · 🤖${r.bots}`}
                    </span>
                    <button className="btn btn-primary btn-sm" onClick={() => void go('join', r.code)}>
                      {t('home.join')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <nav className="grid grid-cols-2 gap-2 text-sm">
            <Link to="/leaderboard" className="btn btn-secondary">
              🏆 {t('home.leaderboard')}
            </Link>
            <Link to="/store" className="btn btn-secondary">
              🛍️ {t('home.store')}
            </Link>
            <Link to="/how-to-play" className="btn btn-secondary">
              📖 {t('home.howToPlay')}
            </Link>
            <Link to="/editor" className="btn btn-secondary">
              🛠️ {t('home.editor')}
            </Link>
          </nav>
          {daily && (
            <div className="panel p-3 text-sm">
              <div className="font-bold">🎯 {t('home.daily')}</div>
              <ul className="mt-1 text-xs opacity-80">
                <li>Play 3 games: {Math.min(3, daily.games ?? 0)}/3</li>
                <li>Win a game: {Math.min(1, daily.wins ?? 0)}/1</li>
                <li>Play India – Heritage: {Math.min(1, daily['map:india-heritage'] ?? 0)}/1</li>
              </ul>
            </div>
          )}
          <AdSlot placement="home" enabled={!!config?.adsEnabled} entitlements={ents} />
        </section>
      </div>
      <footer className="text-center text-xs opacity-50">
        {BRAND.name} v{BRAND.version} · {t('app.tagline')} ·{' '}
        <a href="/how-to-play#privacy" className="underline">
          Privacy
        </a>
      </footer>
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <span className="hidden">{glyphFor(AVATARS, profile.avatar)}</span>
    </main>
  );
}
