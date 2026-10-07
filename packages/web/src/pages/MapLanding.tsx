import type { MapDefinition } from '@bt/engine';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Board } from '../components/board/Board';
import { BRAND } from '../config/brand';
import { groupName, mapName, useI18n, useT } from '../i18n';
import { api } from '../lib/api';
import { useGame } from '../store/useGame';

/** SEO landing page per map: /play/:mapId. Sets title/meta and shows a static board preview. */
export default function MapLanding() {
  const { mapId = '' } = useParams();
  const t = useT();
  const lang = useI18n((s) => s.lang);
  const nav = useNavigate();
  const [map, setMap] = useState<MapDefinition | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const createRoom = useGame((s) => s.createRoom);

  useEffect(() => {
    void api
      .map(mapId)
      .then((m) => {
        setMap(m);
        document.title = m.seo?.title ?? `${m.name} – ${BRAND.name}`;
        const desc = document.querySelector('meta[name=description]');
        if (desc && m.seo?.description) desc.setAttribute('content', m.seo.description);
        const ld = document.createElement('script');
        ld.type = 'application/ld+json';
        ld.id = 'ld-game';
        ld.textContent = JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'VideoGame',
          name: `${BRAND.name}: ${m.name}`,
          description: m.seo?.description ?? m.tagline,
          applicationCategory: 'Game',
          operatingSystem: 'Web',
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR' },
          numberOfPlayers: { '@type': 'QuantitativeValue', minValue: 2, maxValue: 8 },
        });
        document.getElementById('ld-game')?.remove();
        document.head.appendChild(ld);
      })
      .catch(() => nav('/'));
    return () => {
      document.title = `${BRAND.name} – free multiplayer board game`;
      document.getElementById('ld-game')?.remove();
    };
  }, [mapId, nav]);

  if (!map) return <main className="p-8 text-center opacity-60">{t('app.loading')}</main>;
  const properties = map.tiles.filter((x) => x.type === 'property');

  return (
    <main
      id="main"
      className="mx-auto flex max-w-5xl flex-col gap-6 px-4 pt-[calc(var(--safe-top)+1rem)] pb-16"
    >
      <nav className="text-sm">
        <Link to="/" className="underline opacity-70">
          ← {BRAND.name}
        </Link>
      </nav>
      <header className="grid items-center gap-6 md:grid-cols-2">
        <div>
          <h1 className="font-display text-3xl font-black sm:text-4xl">
            {map.flag} {mapName(map, lang)}
          </h1>
          <p className="mt-2 text-lg opacity-80">{map.tagline}</p>
          <p className="mt-3 text-sm opacity-70">{map.seo?.description}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to={`/?map=${map.id}`} className="btn btn-primary" onClick={() => void createRoom}>
              ▶️ {t('app.play')}
            </Link>
            <Link to="/how-to-play" className="btn btn-secondary">
              📖 {t('home.howToPlay')}
            </Link>
          </div>
        </div>
        <div className="mx-auto w-full max-w-md">
          <Board map={map} game={null} selectedTile={selected} onSelect={setSelected}>
            <div className="p-3 text-center text-white drop-shadow">
              <div className="text-2xl font-black">{map.name}</div>
              <div className="text-xs opacity-90">{map.country}</div>
            </div>
          </Board>
        </div>
      </header>
      <section>
        <h2 className="mb-2 text-xl font-bold">
          {properties.length} properties in {map.groups.length} regions
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {map.groups.map((g) => (
            <div key={g.id} className="panel p-3" style={{ borderTop: `6px solid ${g.color}` }}>
              <div className="font-bold">{groupName(map, g.id, lang)}</div>
              <ul className="mt-1 text-sm opacity-80">
                {properties
                  .filter((p) => p.type === 'property' && p.group === g.id)
                  .map((p) => (
                    <li key={p.id}>
                      {p.emoji} {p.i18n?.[lang]?.name ?? p.name}
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
      <section className="panel p-4 text-sm">
        <h2 className="mb-1 font-bold">About this map</h2>
        <p>
          {map.cards.luck.length + map.cards.treasure.length} unique {map.deckNames?.luck ?? 'Luck'} and{' '}
          {map.deckNames?.treasure ?? 'Treasure'} cards,{' '}
          {map.tiles.filter((x) => x.type === 'transport').length} transport lines,{' '}
          {map.tiles.filter((x) => x.type === 'utility').length} utilities. Currency: {map.currency.code}.
        </p>
      </section>
    </main>
  );
}
