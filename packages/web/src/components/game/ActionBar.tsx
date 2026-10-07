import type { GameState, LegalActions, MapDefinition } from '@bt/engine';
import { liquidationValue } from '@bt/engine';
import { useEffect, useState } from 'react';
import { money, tileName, useI18n, useT } from '../../i18n';
import { sfx } from '../../lib/audio';
import { useGame } from '../../store/useGame';

interface Props {
  game: GameState;
  map: MapDefinition;
  legal: LegalActions | null;
  me: string | null;
  deadline: number | null;
}

/** Countdown for the current deadline. */
export function TurnTimer({ deadline }: { deadline: number | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!deadline) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [deadline]);
  if (!deadline) return null;
  const left = Math.max(0, Math.ceil((deadline - now) / 1000));
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${left <= 10 ? 'bg-red-600 text-white' : 'bg-[var(--panel-muted)]'}`}
      aria-live="off"
    >
      ⏱ {left}s
    </span>
  );
}

export function ActionBar({ game, map, legal, me, deadline }: Props) {
  const t = useT();
  const lang = useI18n((s) => s.lang);
  const act = useGame((s) => s.act);
  const selectTile = useGame((s) => s.selectTile);
  const player = me ? game.players.find((p) => p.id === me) : null;
  const current = game.players[game.current]!;
  const isMyTurn = player?.id === current.id;
  const waiting = game.phase === 'auction' ? [] : [current.id];

  if (!player || player.bankrupt || game.status !== 'playing') {
    return (
      <div className="flex items-center justify-center gap-2 text-sm opacity-70">
        {game.status === 'playing' && t('game.turnOf', { name: current.name })}
        <TurnTimer deadline={deadline} />
      </div>
    );
  }

  const myDebt = game.debts.filter((d) => d.debtor === me);
  if (myDebt.length > 0) {
    const owed = myDebt.reduce((a, d) => a + d.amount, 0);
    const to = myDebt[0]!.creditor
      ? (game.players.find((p) => p.id === myDebt[0]!.creditor)?.name ?? '?')
      : t('app.bank');
    return (
      <div className="flex flex-col items-center gap-2 text-center" data-testid="debt-bar">
        <p className="text-sm font-semibold text-red-400">
          {t('game.debt', { amount: money(map, owed), to })}
        </p>
        <p className="text-xs opacity-70">
          {t('game.canRaise', { amount: money(map, liquidationValue(game, map, player.id)) })}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {legal?.sellHouse.length ? (
            <button className="btn btn-secondary btn-sm" onClick={() => selectTile(legal.sellHouse[0]!)}>
              {t('game.sellHouse', { refund: '' }).replace(' (+)', '')}
            </button>
          ) : null}
          {legal?.mortgage.length ? (
            <button className="btn btn-secondary btn-sm" onClick={() => selectTile(legal.mortgage[0]!)}>
              {t('game.mortgage', { amount: '' }).replace(' (+)', '')}
            </button>
          ) : null}
          {legal?.declareBankrupt && (
            <button className="btn btn-danger btn-sm" onClick={() => void act({ type: 'declareBankrupt' })}>
              {t('game.declareBankrupt')}
            </button>
          )}
        </div>
      </div>
    );
  }

  if (game.phase === 'auction') return null; // AuctionPanel handles it

  if (!isMyTurn) {
    const names = waiting.map((id) => game.players.find((p) => p.id === id)?.name ?? '?').join(', ');
    return (
      <div className="flex items-center justify-center gap-2 text-sm opacity-70" data-testid="waiting">
        {t('game.waitingFor', { names })}
        <TurnTimer deadline={deadline} />
      </div>
    );
  }

  const pending = game.pendingBuy !== null ? map.tiles[game.pendingBuy] : null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-2" data-testid="action-bar">
      <span className="mr-1 text-sm font-bold text-[var(--accent)]">{t('game.yourTurn')}</span>
      <TurnTimer deadline={deadline} />
      {game.phase === 'preRoll' && player.inJail && (
        <>
          <span className="w-full text-center text-xs opacity-70">
            {t('game.inJail')} ·{' '}
            {t('game.jailTurns', { n: player.jailTurns + 1, max: game.rules.maxJailTurns })}
          </span>
          {legal?.payJail && (
            <button className="btn btn-secondary" onClick={() => void act({ type: 'payJail' })}>
              {t('game.payFine', { amount: money(map, game.rules.jailFine) })}
            </button>
          )}
          {legal?.useJailCard && (
            <button className="btn btn-secondary" onClick={() => void act({ type: 'useJailCard' })}>
              {t('game.useCard')}
            </button>
          )}
        </>
      )}
      {legal?.roll && (
        <button
          className="btn btn-primary pulse"
          data-testid="roll"
          onClick={() => {
            sfx.play('dice');
            void act({ type: 'roll' });
          }}
        >
          🎲 {player.inJail ? t('game.rollForDoubles') : t('game.roll')}
        </button>
      )}
      {legal?.buy && pending && 'price' in pending && (
        <button className="btn btn-primary" data-testid="buy" onClick={() => void act({ type: 'buy' })}>
          🏷️ {t('game.buy', { price: money(map, pending.price) })}
        </button>
      )}
      {legal?.declineBuy && (
        <button
          className="btn btn-secondary"
          data-testid="decline"
          onClick={() => void act({ type: 'declineBuy' })}
        >
          {game.rules.auctionEnabled ? `🔨 ${t('game.auction')}` : t('game.decline')}
        </button>
      )}
      {game.phase === 'awaitBuy' && pending && (
        <span className="w-full text-center text-xs opacity-70">{tileName(map, game.pendingBuy!, lang)}</span>
      )}
      {legal?.endTurn && (
        <button
          className="btn btn-primary"
          data-testid="end-turn"
          onClick={() => void act({ type: 'endTurn' })}
        >
          ✅ {t('game.endTurn')}
        </button>
      )}
    </div>
  );
}
