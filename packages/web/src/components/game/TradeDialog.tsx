import type { GameState, MapDefinition, TradeOffer, TradeSide } from '@bt/engine';
import { ownedTiles, groupTiles } from '@bt/engine';
import { useEffect, useMemo, useState } from 'react';
import { money, tileName, useI18n, useT } from '../../i18n';
import { groupColor } from '../../lib/tileArt';
import { useGame } from '../../store/useGame';
import { Modal } from '../ui/Modal';

interface Props {
  game: GameState;
  map: MapDefinition;
  me: string;
}

const empty = (): TradeSide => ({ cash: 0, properties: [], jailCards: 0 });

/** Properties a player can put in a trade (no houses anywhere in the group). */
function tradeable(game: GameState, map: MapDefinition, pid: string): number[] {
  return ownedTiles(game, pid).filter((i) => {
    const t = map.tiles[i]!;
    if (t.type !== 'property') return true;
    return groupTiles(map, t.group).every((k) => (game.ownership[k]?.houses ?? 0) === 0);
  });
}

function SideEditor({
  game,
  map,
  pid,
  side,
  onChange,
  title,
}: {
  game: GameState;
  map: MapDefinition;
  pid: string;
  side: TradeSide;
  onChange(s: TradeSide): void;
  title: string;
}) {
  const t = useT();
  const lang = useI18n((s) => s.lang);
  const p = game.players.find((x) => x.id === pid)!;
  const tiles = useMemo(() => tradeable(game, map, pid), [game, map, pid]);
  return (
    <div className="flex-1 rounded-xl border border-black/10 p-2">
      <div className="mb-1 text-xs font-bold uppercase opacity-60">{title}</div>
      <label className="flex items-center gap-2 text-sm">
        {t('trade.cash')}
        <input
          type="number"
          className="input w-28"
          min={0}
          max={p.cash}
          value={side.cash}
          onChange={(e) =>
            onChange({
              ...side,
              cash: Math.max(0, Math.min(p.cash, Math.floor(Number(e.target.value) || 0))),
            })
          }
          aria-label={`${title} ${t('trade.cash')}`}
        />
        <span className="text-xs opacity-60">/ {money(map, p.cash)}</span>
      </label>
      {p.jailCards > 0 && (
        <label className="mt-1 flex items-center gap-2 text-sm">
          {t('trade.jailCards')}
          <input
            type="number"
            className="input w-20"
            min={0}
            max={p.jailCards}
            value={side.jailCards}
            onChange={(e) =>
              onChange({
                ...side,
                jailCards: Math.max(0, Math.min(p.jailCards, Number(e.target.value) || 0)),
              })
            }
          />
        </label>
      )}
      <div className="mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto scrollbar-thin">
        {tiles.length === 0 && <span className="text-xs opacity-50">{t('trade.nothing')}</span>}
        {tiles.map((i) => {
          const checked = side.properties.includes(i);
          const tile = map.tiles[i]!;
          return (
            <label
              key={i}
              className="flex cursor-pointer items-center gap-2 rounded px-1 text-sm hover:bg-black/5"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) =>
                  onChange({
                    ...side,
                    properties: e.target.checked
                      ? [...side.properties, i]
                      : side.properties.filter((x) => x !== i),
                  })
                }
              />
              <span className="h-3 w-3 rounded-sm" style={{ background: groupColor(map, tile) ?? '#999' }} />
              <span className="truncate">{tileName(map, i, lang)}</span>
              {game.ownership[i]?.mortgaged && <span className="text-[10px] text-red-600">M</span>}
            </label>
          );
        })}
      </div>
    </div>
  );
}

function SideSummary({ side, map, game }: { side: TradeSide; map: MapDefinition; game: GameState }) {
  const t = useT();
  const lang = useI18n((s) => s.lang);
  const parts: string[] = [];
  if (side.cash) parts.push(money(map, side.cash));
  for (const i of side.properties)
    parts.push(`${tileName(map, i, lang)}${game.ownership[i]?.mortgaged ? ' (M)' : ''}`);
  if (side.jailCards) parts.push(`${side.jailCards} 🎟️`);
  return <span>{parts.length ? parts.join(', ') : t('trade.nothing')}</span>;
}

/** Trade composer + inbox for incoming offers. */
export function TradeDialog({ game, map, me }: Props) {
  const t = useT();
  const tradeWith = useGame((s) => s.tradeWith);
  const openTrade = useGame((s) => s.openTrade);
  const act = useGame((s) => s.act);
  const [offer, setOffer] = useState<TradeSide>(empty());
  const [request, setRequest] = useState<TradeSide>(empty());
  const [countering, setCountering] = useState<TradeOffer | null>(null);
  const incoming = game.trades.filter((tr) => tr.status === 'pending' && tr.to === me);
  const outgoing = game.trades.filter((tr) => tr.status === 'pending' && tr.from === me);
  const others = game.players.filter((p) => p.id !== me && !p.bankrupt);

  useEffect(() => {
    if (tradeWith) {
      setOffer(empty());
      setRequest(empty());
      setCountering(null);
    }
  }, [tradeWith]);

  const partner = tradeWith ? game.players.find((p) => p.id === tradeWith) : null;
  const nothing =
    offer.cash === 0 &&
    offer.properties.length === 0 &&
    offer.jailCards === 0 &&
    request.cash === 0 &&
    request.properties.length === 0 &&
    request.jailCards === 0;

  return (
    <>
      {/* Incoming offers surface as a persistent banner so they are never missed. */}
      {incoming.map((tr) => {
        const from = game.players.find((p) => p.id === tr.from)!;
        return (
          <div key={tr.id} className="panel mb-2 border-saffron p-3 text-sm" data-testid="incoming-trade">
            <div className="mb-1 font-bold">🤝 {t('trade.incoming', { name: from.name })}</div>
            <div className="text-xs">
              <b>{t('trade.youGet')}:</b> <SideSummary side={tr.offer} map={map} game={game} />
            </div>
            <div className="text-xs">
              <b>{t('trade.youGive')}:</b> <SideSummary side={tr.request} map={map} game={game} />
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                className="btn btn-primary btn-sm"
                data-testid="accept-trade"
                onClick={() => void act({ type: 'acceptTrade', tradeId: tr.id })}
              >
                {t('trade.accept')}
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => void act({ type: 'declineTrade', tradeId: tr.id })}
              >
                {t('trade.declineOffer')}
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setCountering(tr);
                  setOffer({ ...tr.request });
                  setRequest({ ...tr.offer });
                  openTrade(tr.from);
                }}
              >
                {t('trade.counter')}
              </button>
            </div>
          </div>
        );
      })}
      {outgoing.map((tr) => (
        <div key={tr.id} className="panel mb-2 flex items-center justify-between gap-2 p-2 text-xs">
          <span>
            ⏳ {t('trade.outgoing', { name: game.players.find((p) => p.id === tr.to)?.name ?? '?' })}
          </span>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => void act({ type: 'cancelTrade', tradeId: tr.id })}
          >
            {t('trade.cancel')}
          </button>
        </div>
      ))}

      <Modal
        open={!!tradeWith}
        onClose={() => openTrade(null)}
        title={partner ? t('trade.title', { name: partner.name }) : t('trade.pickPlayer')}
        size="lg"
      >
        {!partner && (
          <div className="flex flex-wrap gap-2">
            {others.map((p) => (
              <button key={p.id} className="btn btn-secondary" onClick={() => openTrade(p.id)}>
                <span className="h-3 w-3 rounded-full" style={{ background: p.color }} /> {p.name}
              </button>
            ))}
          </div>
        )}
        {partner && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row">
              <SideEditor
                game={game}
                map={map}
                pid={me}
                side={offer}
                onChange={setOffer}
                title={t('trade.youGive')}
              />
              <SideEditor
                game={game}
                map={map}
                pid={partner.id}
                side={request}
                onChange={setRequest}
                title={t('trade.youGet')}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn btn-secondary" onClick={() => openTrade(null)}>
                {t('app.cancel')}
              </button>
              <button
                className="btn btn-primary"
                data-testid="propose-trade"
                disabled={nothing}
                onClick={async () => {
                  const ok = countering
                    ? await act({ type: 'counterTrade', tradeId: countering.id, offer, request })
                    : await act({ type: 'proposeTrade', to: partner.id, offer, request });
                  if (ok) openTrade(null);
                }}
              >
                {countering ? t('trade.counter') : t('trade.propose')}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
