import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ProfileEditor } from './Home';
import { Lobby } from '../components/lobby/Lobby';
import { GameScreen } from '../components/game/GameScreen';
import { useT } from '../i18n';
import { api, type AppConfig } from '../lib/api';
import { getProfile, saveProfile, type Profile } from '../lib/storage';
import { useEntitlements } from '../lib/useEntitlements';
import { useGame } from '../store/useGame';
import { sfx } from '../lib/audio';

export default function RoomPage() {
  const { code = '' } = useParams();
  const [params] = useSearchParams();
  const t = useT();
  const room = useGame((s) => s.room);
  const game = useGame((s) => s.game);
  const map = useGame((s) => s.map);
  const legal = useGame((s) => s.legal);
  const me = useGame((s) => s.me);
  const connected = useGame((s) => s.connected);
  const joinRoom = useGame((s) => s.joinRoom);
  const [profile, setProfile] = useState<Profile>(getProfile);
  const [needName, setNeedName] = useState(profile.name.trim().length < 2);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const ents = useEntitlements();

  useEffect(() => {
    void api
      .config()
      .then(setConfig)
      .catch(() => undefined);
  }, []);

  // Join (or re-join) once connected and we have a name.
  useEffect(() => {
    if (!connected || needName) return;
    if (room?.code === code.toUpperCase()) return;
    let cancelled = false;
    void joinRoom(code).then((res) => {
      if (cancelled) return;
      if (!res.ok) setError(res.message);
    });
    return () => {
      cancelled = true;
    };
  }, [connected, needName, code, joinRoom, room?.code]);

  if (needName) {
    return (
      <main id="main" className="mx-auto max-w-md p-4 pt-[calc(var(--safe-top)+2rem)]">
        <div className="panel flex flex-col gap-4 p-4">
          <h1 className="text-xl font-black">
            {t('home.join')} · {code.toUpperCase()}
          </h1>
          <ProfileEditor profile={profile} onChange={setProfile} />
          <button
            className="btn btn-primary"
            disabled={profile.name.trim().length < 2}
            onClick={() => {
              saveProfile(profile);
              sfx.unlock();
              setNeedName(false);
            }}
          >
            {t('home.join')}
          </button>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main id="main" className="mx-auto max-w-md p-8 text-center">
        <p className="mb-4 text-lg font-bold">{error}</p>
        <Link to="/" className="btn btn-primary">
          {t('app.back')}
        </Link>
      </main>
    );
  }

  if (!room || room.code !== code.toUpperCase() || !map) {
    return (
      <main id="main" className="p-8 text-center opacity-60">
        {connected ? t('app.loading') : t('app.offline')}
      </main>
    );
  }

  const mapSummary = config?.maps.find((m) => m.id === room.mapId) ?? null;
  if (room.status === 'lobby' || !game) {
    return (
      <Lobby
        room={room}
        me={me}
        mapSummary={mapSummary}
        adsEnabled={!!config?.adsEnabled}
        entitlements={ents}
        autostart={params.get('autostart') === '1'}
      />
    );
  }
  return (
    <>
      {!connected && (
        <div className="fixed inset-x-0 top-0 z-50 bg-red-600 py-1 text-center text-xs font-bold text-white">
          {t('app.offline')}
        </div>
      )}
      <GameScreen
        room={room}
        game={game}
        map={map}
        legal={legal}
        me={me}
        adsEnabled={!!config?.adsEnabled}
        entitlements={ents}
      />
    </>
  );
}
