import type { GameState, LegalActions, MapDefinition } from '@bt/engine';
import { useEffect, useState } from 'react';
import { money, tileName, useI18n, useT } from '../../i18n';
import { useGame } from '../../store/useGame';
import { TurnTimer } from './ActionBar';

interface Props {
  game: GameState;
  map: MapDefinition;
  legal: LegalActions | null;
  me: string | null;
  deadline: number | null;
}

export function AuctionPanel({ game, map, legal, me, deadline }: Props) {
  const t = useT();
  const lang = useI18n((s) => s.lang);
  const act = useGame((s) => s.act);
  const a = game.auction;
  const [bid, setBid] = useState(0);
  useEffect(() => {
    if (legal?.bid) setBid(legal.bid.min);
  }, [legal?.bid?.min, legal?.bid]);
  if (!a) return null;
  const high = a.highBidder ? game.players.find((p) => p.id === a.highBidder) : null;
  const canBid = !!legal?.bid;
  const quick = canBid
    ? [
        legal!.bid!.min,
        legal!.bid!.min + game.rules.auctionMinIncrement * 4,
        Math.round(((map.tiles[a.tile] as { price?: number }).price ?? 0) * 0.75),
      ]
    : [];
  return (
    <div className="flex flex-col items-center gap-2 text-center" data-testid="auction">
      <div className="text-sm font-bold">
        🔨 {t('game.auctionFor', { tile: tileName(map, a.tile, lang) })} <TurnTimer deadline={deadline} />
      </div>
      <div className="text-xs opacity-80">
        {high ? (
          <>
            {t('game.highBid')}: <b style={{ color: high.color }}>{high.name}</b> ·{' '}
            <b>{money(map, a.highBid)}</b>
          </>
        ) : (
          t('game.noBids')
        )}
      </div>
      <div className="flex flex-wrap justify-center gap-1 text-[11px] opacity-70">
        {a.active.map((id) => {
          const p = game.players.find((x) => x.id === id);
          if (!p || p.bankrupt) return null;
          const passed = a.passed.includes(id);
          return (
            <span
              key={id}
              className={`rounded-full px-2 py-0.5 ${passed ? 'line-through opacity-50' : ''}`}
              style={{ background: `${p.color}22` }}
            >
              {p.name}
            </span>
          );
        })}
      </div>
      {me && (canBid || legal?.passBid) && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {canBid && (
            <>
              <input
                type="number"
                className="input w-28 text-center"
                min={legal!.bid!.min}
                max={legal!.bid!.max}
                step={game.rules.auctionMinIncrement}
                value={bid}
                onChange={(e) => setBid(Number(e.target.value))}
                aria-label={t('game.bid')}
              />
              <button
                className="btn btn-primary btn-sm"
                data-testid="bid"
                disabled={bid < legal!.bid!.min || bid > legal!.bid!.max}
                onClick={() => void act({ type: 'bid', amount: Math.floor(bid) })}
              >
                {t('game.bid')} {money(map, bid)}
              </button>
              {[...new Set(quick)]
                .filter((q) => q >= legal!.bid!.min && q <= legal!.bid!.max)
                .map((q) => (
                  <button
                    key={q}
                    className="btn btn-secondary btn-sm"
                    onClick={() => void act({ type: 'bid', amount: q })}
                  >
                    {money(map, q)}
                  </button>
                ))}
            </>
          )}
          {legal?.passBid && (
            <button
              className="btn btn-ghost btn-sm"
              data-testid="pass-bid"
              onClick={() => void act({ type: 'passBid' })}
            >
              {t('game.pass')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
