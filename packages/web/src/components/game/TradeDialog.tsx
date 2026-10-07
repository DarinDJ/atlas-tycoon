import type { GameState, MapDefinition, TradeOffer, TradeSide } from '@bt/engine';
import { ownedTiles, groupTiles } from '@bt/engine';
import { useEffect, useMemo, useState } from 'react';
import { money, tileName, useI18n, useT } from '../../i18n';
import { groupColor } from '../../lib/tileArt';
import { useGame } from '../../store/useGame';
import { Modal } from '../ui/Modal';
import { Pawn } from '../Pawn';

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

function PropertyChip({
  game,
  map,
  idx,
  selected,
  onToggle,
}: {
  game: GameState;
  map: MapDefinition;
  idx: number;
  selected: boolean;
  onToggle(): void;
}) {
  const lang = useI18n((s) => s.lang);
  const tile = map.tiles[idx]!;
  const color = groupColor(map, tile) ?? '#777';
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-left text-xs font-semibold transition ${
        selected
          ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_18%,transparent)]'
          : 'border-[var(--panel-border)] bg-[var(--bg-elevated)] hover:brightness-110'
      }`}
    >
      <span className="h-5 w-1.5 shrink-0 rounded-sm" style={{ background: color }} />
      <span className="truncate">{tileName(map, idx, lang)}</span>
      {game.ownership[idx]?.mortgaged && <span className="text-[10px] text-red-400">M</span>}
      <span className="ml-auto text-[10px] opacity-60">{'price' in tile ? money(map, tile.price) : ''}</span>
    </button>
  );
}

function SideEditor({
  game,
  map,
  pid,
  side,
  onChange,
  title,
  align,
}: {
  game: GameState;
  map: MapDefinition;
  pid: string;
  side: TradeSide;
  onChange(s: TradeSide): void;
  title: string;
  align: 'left' | 'right';
}) {
  const t = useT();
  const p = game.players.find((x) => x.id === pid)!;
  const tiles = useMemo(() => tradeable(game, map, pid), [game, map, pid]);
  const total =
    side.cash + side.properties.reduce((a, i) => a + ((map.tiles[i] as { price?: number }).price ?? 0), 0);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 rounded-xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-3">
      <div className={`flex items-center gap-2 ${align === 'right' ? 'flex-row-reverse text-right' : ''}`}>
        <Pawn avatar={p.avatar} color={p.color} skin={p.token} size={34} />
        <div className="min-w-0">
          <div className="truncate text-sm font-bold">{p.name}</div>
          <div className="text-[11px] opacity-60">
            {title} · {money(map, p.cash)} {t('game.cash').toLowerCase()}
          </div>
        </div>
      </div>
      <label className="flex items-center gap-2 text-xs font-semibold">
        <span className="w-10">{t('trade.cash')}</span>
        <input
          type="range"
          min={0}
          max={p.cash}
          step={Math.max(1, Math.round(p.cash / 100))}
          value={Math.min(side.cash, p.cash)}
          onChange={(e) => onChange({ ...side, cash: Number(e.target.value) })}
          className="flex-1 accent-[var(--accent)]"
          aria-label={`${title} ${t('trade.cash')}`}
        />
        <input
          type="number"
          className="input w-24 py-1 text-right"
          min={0}
          max={p.cash}
          value={side.cash}
          onChange={(e) =>
            onChange({
              ...side,
              cash: Math.max(0, Math.min(p.cash, Math.floor(Number(e.target.value) || 0))),
            })
          }
          aria-label={`${title} ${t('trade.cash')} exact`}
        />
      </label>
      {p.jailCards > 0 && (
        <label className="flex items-center gap-2 text-xs font-semibold">
          <span className="w-10">🎟️</span>
          <input
            type="number"
            className="input w-20 py-1"
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
          <span className="opacity-60">{t('trade.jailCards')}</span>
        </label>
      )}
      <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-1 gap-1 overflow-y-auto pr-1 scrollbar-thin sm:grid-cols-2">
        {tiles.length === 0 && <span className="text-xs opacity-50">{t('trade.nothing')}</span>}
        {tiles.map((i) => (
          <PropertyChip
            key={i}
            game={game}
            map={map}
            idx={i}
            selected={side.properties.includes(i)}
            onToggle={() =>
              onChange({
                ...side,
                properties: side.properties.includes(i)
                  ? side.properties.filter((x) => x !== i)
                  : [...side.properties, i],
              })
            }
          />
        ))}
      </div>
      <div className="text-right text-xs opacity-70">
        ≈ <b>{money(map, total)}</b>
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

/** Trade composer (two columns that fit one screen) + inbox for incoming offers. */
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
    if (tradeWith && !countering) {
      setOffer(empty());
      setRequest(empty());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tradeWith]);

  // '*' = open the player picker first.
  const partner = tradeWith && tradeWith !== '*' ? game.players.find((p) => p.id === tradeWith) : null;
  const nothing =
    offer.cash === 0 &&
    offer.properties.length === 0 &&
    offer.jailCards === 0 &&
    request.cash === 0 &&
    request.properties.length === 0 &&
    request.jailCards === 0;

  return (
    <>
      {incoming.map((tr) => {
        const from = game.players.find((p) => p.id === tr.from)!;
        return (
          <div
            key={tr.id}
            className="panel mb-2 flex flex-wrap items-center gap-3 border-[var(--accent)] p-3 text-sm"
            data-testid="incoming-trade"
          >
            <Pawn avatar={from.avatar} color={from.color} skin={from.token} size={32} />
            <div className="min-w-0 flex-1">
              <div className="font-bold">🤝 {t('trade.incoming', { name: from.name })}</div>
              <div className="text-xs">
                <b>{t('trade.youGet')}:</b> <SideSummary side={tr.offer} map={map} game={game} /> ·{' '}
                <b>{t('trade.youGive')}:</b> <SideSummary side={tr.request} map={map} game={game} />
              </div>
            </div>
            <div className="flex gap-2">
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
        onClose={() => {
          openTrade(null);
          setCountering(null);
        }}
        title={partner ? t('trade.title', { name: partner.name }) : t('trade.pickPlayer')}
        size="lg"
      >
        {!partner && (
          <div className="flex flex-wrap gap-2">
            {others.map((p) => (
              <button key={p.id} className="btn btn-secondary" onClick={() => openTrade(p.id)}>
                <Pawn avatar={p.avatar} color={p.color} skin={p.token} size={24} /> {p.name}
              </button>
            ))}
          </div>
        )}
        {partner && (
          <div className="flex h-[min(70dvh,34rem)] flex-col gap-3">
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
              <SideEditor
                game={game}
                map={map}
                pid={me}
                side={offer}
                onChange={setOffer}
                title={t('trade.youGive')}
                align="left"
              />
              <SideEditor
                game={game}
                map={map}
                pid={partner.id}
                side={request}
                onChange={setRequest}
                title={t('trade.youGet')}
                align="right"
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs opacity-70">
                <b>{t('trade.youGive')}:</b> <SideSummary side={offer} map={map} game={game} /> →{' '}
                <b>{t('trade.youGet')}:</b> <SideSummary side={request} map={map} game={game} />
              </div>
              <div className="flex shrink-0 gap-2">
                <button className="btn btn-secondary btn-sm" onClick={() => openTrade(null)}>
                  {t('app.cancel')}
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  data-testid="propose-trade"
                  disabled={nothing}
                  onClick={async () => {
                    const ok = countering
                      ? await act({ type: 'counterTrade', tradeId: countering.id, offer, request })
                      : await act({ type: 'proposeTrade', to: partner.id, offer, request });
                    if (ok) {
                      openTrade(null);
                      setCountering(null);
                    }
                  }}
                >
                  🤝 {countering ? t('trade.counter') : t('trade.propose')}
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
