import type { GameState, MapDefinition } from '@bt/engine';
import { formatMoney } from '@bt/engine';
import { memo } from 'react';
import type { TileGeom } from '../../lib/board';
import { groupColor, groupMarker, tileGlyph } from '../../lib/tileArt';
import { tileName, useI18n } from '../../i18n';
import { useSettings } from '../../store/useSettings';
import { Pawn } from '../Pawn';

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
      data-owned={!!owner}
      style={{
        gridColumn: geom.col,
        gridRow: geom.row,
        ['--owner-color' as string]: owner?.color ?? 'transparent',
      }}
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
      {color && !geom.corner && (
        <div className="band" style={{ background: color }} aria-hidden>
          {colorblind && marker && <span className="band-marker">{marker}</span>}
        </div>
      )}
      {own && own.houses > 0 && (
        <div className="houses" aria-label={own.houses === 5 ? 'hotel' : `${own.houses} houses`}>
          {own.houses === 5 ? (
            <span className="hotel">H</span>
          ) : (
            Array.from({ length: own.houses }, (_, i) => <span key={i} className="house" />)
          )}
        </div>
      )}
      <div className="body">
        <span className="emoji" aria-hidden>
          {tileGlyph(tile)}
        </span>
        <span className="name line-clamp-2">{name}</span>
        {price && !owner && <span className="price">{price}</span>}
      </div>
      {owner && (
        <div className="owner" aria-hidden>
          <Pawn
            avatar={owner.avatar}
            color={owner.color}
            skin={owner.token}
            size={0}
            className="owner-pawn"
          />
        </div>
      )}
      {own?.mortgaged && <div className="mortgage-stripe" aria-hidden />}
      {highlight && (
        <div
          className="pointer-events-none absolute inset-0 ring-4 ring-inset ring-[var(--accent)]"
          aria-hidden
        />
      )}
    </div>
  );
});
