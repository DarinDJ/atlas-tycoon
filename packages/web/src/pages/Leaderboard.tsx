import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../i18n';
import { api, type LeaderboardRow, type MapSummary } from '../lib/api';

export default function Leaderboard() {
  const t = useT();
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [maps, setMaps] = useState<MapSummary[]>([]);
  const [mapId, setMapId] = useState('');
  useEffect(() => {
    void api
      .maps()
      .then(setMaps)
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    void api
      .leaderboard(mapId || undefined)
      .then(setRows)
      .catch(() => setRows([]));
  }, [mapId]);
  return (
    <main id="main" className="mx-auto max-w-2xl px-4 pt-[calc(var(--safe-top)+1rem)] pb-16">
      <nav className="mb-3 text-sm">
        <Link to="/" className="underline opacity-70">
          ← {t('app.back')}
        </Link>
      </nav>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h1 className="shrink-0 text-2xl font-black">🏆 {t('home.leaderboard')}</h1>
        <select
          className="input w-auto"
          value={mapId}
          onChange={(e) => setMapId(e.target.value)}
          aria-label={t('lobby.map')}
        >
          <option value="">All maps</option>
          {maps.map((m) => (
            <option key={m.id} value={m.id}>
              {m.flag} {m.name}
            </option>
          ))}
        </select>
      </div>
      <div className="panel overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[var(--panel-muted)] text-left text-xs uppercase">
            <tr>
              <th className="p-2">#</th>
              <th className="p-2">Player</th>
              <th className="p-2 text-right">Wins</th>
              <th className="p-2 text-right">Games</th>
              <th className="p-2 text-right">Win %</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td className="p-4 text-center opacity-60" colSpan={5}>
                  No games played yet. Be the first!
                </td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr key={r.clientId} className="border-t border-black/5">
                <td className="p-2 tabular-nums">{i + 1}</td>
                <td className="p-2 font-semibold">{r.name}</td>
                <td className="p-2 text-right tabular-nums">{r.wins}</td>
                <td className="p-2 text-right tabular-nums">{r.games}</td>
                <td className="p-2 text-right tabular-nums">
                  {r.games ? Math.round((100 * r.wins) / r.games) : 0}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
