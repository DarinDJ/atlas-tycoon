import type { GameState, MapDefinition } from '@bt/engine';
import { formatMoney } from '@bt/engine';
import { memo } from 'react';
import type { TileGeom } from '../../lib/board';
import { groupColor, groupMarker, tileGlyph } from '../../lib/tileArt';
import { tileName, useI18n } from '../../i18n';
import { useSettings } from '../../store/useSettings';

interface Props {
  index: number;
  geom: TileGeom;
  map: MapDefinition;
  game: GameState | null;
  selected: boolean;
  highlight?: boolean;
  onSelect(i: number): void;
}

export const TileView = memo(function TileView({
  index,
  geom,
  map,
  game,
  selected,
  highlight,
  onSelect,
}: Props) {
  const tile = map.tiles[index]!;
  const lang = useI18n((s) => s.lang);
  const colorblind = useSettings((s) => s.colorblind);
  const color = groupColor(map, tile);
  const marker = groupMarker(map, tile);
  const own = game?.ownership[index];
  const owner = own ? game?.players.find((p) => p.id === own.owner) : undefined;
  const price =
    'price' in tile
      ? formatMoney(tile.price, map.currency)
      : tile.type === 'tax'
        ? formatMoney(tile.amount, map.currency)
        : null;
  const name = tileName(map, index, lang);
  return (
    <div
      className={`tile ${geom.corner ? 'corner' : ''}`}
      data-side={geom.side}
      data-selected={selected}
      data-tile={index}
      style={{ gridColumn: geom.col, gridRow: geom.row }}
      role="button"
      tabIndex={0}
      aria-label={`${name}${owner ? `, owned by ${owner.name}` : ''}`}
      onClick={() => onSelect(index)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(index);
        }
      }}
    >
      {owner && <div className="owner-badge" style={{ background: owner.color }} aria-hidden />}
      {own?.mortgaged && <div className="mortgage-stripe" aria-hidden />}
      {color && !geom.corner && (
        <div className="band" style={{ background: color }} aria-hidden>
          {colorblind && marker && (
            <span className="absolute inset-0 flex items-center justify-center text-[0.55em] font-black text-white mix-blend-difference">
              {marker}
            </span>
          )}
        </div>
      )}
      {own && own.houses > 0 && (
        <div className="houses" aria-label={own.houses === 5 ? 'hotel' : `${own.houses} houses`}>
          {own.houses === 5 ? (
            <span>🏨</span>
          ) : (
            Array.from({ length: own.houses }, (_, i) => <span key={i}>🏠</span>)
          )}
        </div>
      )}
      <div className="body">
        <span className="emoji" aria-hidden>
          {tileGlyph(tile)}
        </span>
        <span className="name line-clamp-2">{name}</span>
        {price && !own && <span className="price">{price}</span>}
        {owner && (
          <span className="price" style={{ color: owner.color, opacity: 1, fontWeight: 700 }}>
            {owner.name
              .replace(/\s*\(bot\)/i, '')
              .split(' ')[0]!
              .slice(0, 8)}
          </span>
        )}
      </div>
      {highlight && (
        <div className="pointer-events-none absolute inset-0 ring-4 ring-inset ring-saffron/70" aria-hidden />
      )}
    </div>
  );
});
