import type { GameState, MapDefinition, Player } from '@bt/engine';
import { netWorth, ownedTiles } from '@bt/engine';
import { animate, motion, useMotionValue } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { AVATARS, TOKENS, glyphFor } from '../../config/cosmetics';
import { money, useT } from '../../i18n';
import { groupColor } from '../../lib/tileArt';
import { useGame } from '../../store/useGame';
import { sfx } from '../../lib/audio';

/** Animated money counter. */
export function Money({
  amount,
  map,
  className = '',
}: {
  amount: number;
  map: MapDefinition;
  className?: string;
}) {
  const mv = useMotionValue(amount);
  const [text, setText] = useState(money(map, amount));
  const prev = useRef(amount);
  useEffect(() => {
    const from = prev.current;
    prev.current = amount;
    if (from === amount) return;
    const ctrl = animate(mv, amount, {
      duration: Math.min(1.2, 0.3 + Math.abs(amount - from) / 2000),
      ease: 'easeOut',
      onUpdate: (v) => setText(money(map, Math.round(v))),
    });
    return () => ctrl.stop();
  }, [amount, map, mv]);
  return (
    <motion.span
      key={amount}
      className={className}
      initial={{ color: prev.current < amount ? '#128807' : '#dc2626' }}
      animate={{ color: 'inherit' }}
      transition={{ duration: 1.2 }}
    >
      {text}
    </motion.span>
  );
}

interface Props {
  player: Player;
  game: GameState;
  map: MapDefinition;
  isMe: boolean;
  isCurrent: boolean;
  compact?: boolean;
}

export function PlayerCard({ player, game, map, isMe, isCurrent, compact }: Props) {
  const t = useT();
  const tiles = ownedTiles(game, player.id);
  const nw = netWorth(game, map, player.id);
  const openTrade = useGame((s) => s.openTrade);
  const selectTile = useGame((s) => s.selectTile);
  const me = useGame((s) => s.me);
  const waiting = useGame((s) => s.room?.waitingOn ?? []);
  const isWaiting = waiting.includes(player.id);
  const [menu, setMenu] = useState(false);
  const emit = useGame((s) => s.emit);
  const toast = useGame((s) => s.toast);

  return (
    <div
      className={`panel relative p-2.5 transition ${isCurrent ? 'ring-2 ring-saffron' : ''} ${player.bankrupt ? 'opacity-50' : ''} ${compact ? 'min-w-[9.5rem]' : ''}`}
      data-testid={`player-${player.id}`}
      style={{ borderLeft: `5px solid ${player.color}` }}
    >
      <div className="flex items-center gap-2">
        <span className="relative text-2xl leading-none" aria-hidden>
          {glyphFor(AVATARS, player.avatar)}
          <span className="absolute -right-1.5 -bottom-1 text-xs">{glyphFor(TOKENS, player.token)}</span>
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 truncate text-sm font-bold">
            <span className="truncate">{player.name}</span>
            {isMe && (
              <span className="rounded bg-saffron/15 px-1 text-[10px] uppercase text-saffron-dark">
                {t('app.you')}
              </span>
            )}
            {player.isBot && <span className="text-xs opacity-60">🤖</span>}
            {!player.connected && !player.isBot && <span title={t('game.disconnected')}>🔌</span>}
            {player.inJail && <span title="In jail">🚔</span>}
            {player.jailCards > 0 && (
              <span className="text-xs" title={t('game.jailCards')}>
                🎟️{player.jailCards > 1 ? player.jailCards : ''}
              </span>
            )}
          </div>
          {player.bankrupt ? (
            <div className="text-xs font-semibold text-red-600">{t('game.bankrupt')}</div>
          ) : (
            <div className="flex items-baseline gap-2 text-xs">
              <Money amount={player.cash} map={map} className="text-base font-extrabold tabular-nums" />
              <span className="opacity-60" title={t('game.netWorth')}>
                ≈ {money(map, nw)}
              </span>
            </div>
          )}
        </div>
        {isWaiting && !player.bankrupt && (
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-saffron" title="waiting" />
        )}
        {!isMe && me && !player.bankrupt && (
          <button
            className="btn btn-ghost btn-sm -mr-1 px-2"
            onClick={() => setMenu((m) => !m)}
            aria-label="Player menu"
          >
            ⋯
          </button>
        )}
      </div>
      {menu && (
        <div className="absolute top-10 right-2 z-20 flex flex-col gap-1 rounded-xl border border-black/10 bg-white p-1 shadow-xl">
          <button
            className="btn btn-ghost btn-sm justify-start"
            onClick={() => {
              openTrade(player.id);
              setMenu(false);
            }}
          >
            🤝 {t('game.trade')}
          </button>
          {!player.isBot && (
            <>
              <button
                className="btn btn-ghost btn-sm justify-start"
                onClick={() => {
                  void emit('room:voteKick', { playerId: player.id });
                  setMenu(false);
                }}
              >
                🚪 {t('game.voteKick')}
              </button>
              <button
                className="btn btn-ghost btn-sm justify-start"
                onClick={() => {
                  void emit('chat:mute', { playerId: player.id });
                  setMenu(false);
                  sfx.play('click');
                }}
              >
                🔇 {t('game.mute')}
              </button>
              <button
                className="btn btn-ghost btn-sm justify-start"
                onClick={() => {
                  void emit('chat:report', { playerId: player.id });
                  toast('info', t('game.reported'));
                  setMenu(false);
                }}
              >
                🚩 {t('game.report')}
              </button>
            </>
          )}
        </div>
      )}
      {!compact && tiles.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1" aria-label={t('game.properties')}>
          {tiles.map((i) => {
            const tile = map.tiles[i]!;
            const own = game.ownership[i]!;
            return (
              <button
                key={i}
                className="h-4 w-3 rounded-sm border border-black/20 focus-ring"
                style={{
                  background: groupColor(map, tile) ?? '#999',
                  opacity: own.mortgaged ? 0.35 : 1,
                  boxShadow:
                    own.houses > 0 ? `0 0 0 1.5px ${own.houses === 5 ? '#dc2626' : '#16a34a'}` : undefined,
                }}
                title={`${tile.name}${own.houses ? ` (${own.houses === 5 ? 'hotel' : own.houses + ' houses'})` : ''}${own.mortgaged ? ' (mortgaged)' : ''}`}
                aria-label={tile.name}
                onClick={() => selectTile(i)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
