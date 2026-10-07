import type { GameState, MapDefinition } from '@bt/engine';
import { useMemo, type ReactNode } from 'react';
import { boardGeometry, tokenOffset } from '../../lib/board';
import { TOKENS, glyphFor } from '../../config/cosmetics';
import { TileView } from './Tile';
import { Token } from './Token';

interface Props {
  map: MapDefinition;
  game: GameState | null;
  selectedTile: number | null;
  onSelect(i: number | null): void;
  /** Tile indices to highlight (e.g. legal build targets). */
  highlights?: number[];
  teleported?: Set<string>;
  children?: ReactNode;
}

export function Board({ map, game, selectedTile, onSelect, highlights = [], teleported, children }: Props) {
  const n = map.tiles.length;
  const geometry = useMemo(() => boardGeometry(n), [n]);
  const current = game?.players[game.current]?.id;
  const clusters = useMemo(() => {
    const byTile = new Map<number, string[]>();
    for (const p of game?.players ?? []) {
      if (p.bankrupt) continue;
      byTile.set(p.position, [...(byTile.get(p.position) ?? []), p.id]);
    }
    return byTile;
  }, [game?.players]);
  const hl = useMemo(() => new Set(highlights), [highlights]);

  return (
    <div
      className="board"
      style={{ '--corner': '1.55fr', '--side': geometry.side } as React.CSSProperties}
      role="group"
      aria-label={`${map.name} board`}
      data-testid="board"
    >
      {map.tiles.map((_, i) => (
        <TileView
          key={i}
          index={i}
          geom={geometry.tiles[i]!}
          map={map}
          game={game}
          selected={selectedTile === i}
          highlight={hl.has(i)}
          onSelect={onSelect}
        />
      ))}
      {/* Centre */}
      <div
        className="relative flex flex-col items-center justify-center overflow-hidden"
        style={{
          gridColumn: `2 / ${geometry.side + 2}`,
          gridRow: `2 / ${geometry.side + 2}`,
          background:
            map.theme.centerGradient ??
            `linear-gradient(160deg, ${map.theme.primary}, ${map.theme.secondary})`,
        }}
      >
        {children}
      </div>
      {game?.players.map((p) => {
        if (p.bankrupt) return null;
        const list = clusters.get(p.position) ?? [];
        const { dx, dy } = tokenOffset(list.indexOf(p.id), list.length);
        return (
          <Token
            key={p.id}
            playerId={p.id}
            glyph={glyphFor(TOKENS, p.token)}
            color={p.color}
            position={p.position}
            teleport={teleported?.has(p.id) ?? false}
            geoms={geometry.tiles}
            dx={dx}
            dy={dy}
            active={p.id === current}
            dimmed={!p.connected && !p.isBot}
          />
        );
      })}
    </div>
  );
}
