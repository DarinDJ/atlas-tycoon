import type { GameState, LegalActions, MapDefinition } from '@bt/engine';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useT } from '../../i18n';
import { useGame, type RoomView } from '../../store/useGame';
import { Board } from '../board/Board';
import { Dice } from '../board/Dice';
import { SettingsDialog } from '../SettingsDialog';
import { ActionBar } from './ActionBar';
import { AuctionPanel } from './AuctionPanel';
import { CardReveal } from './CardReveal';
import { Chat } from './Chat';
import { EventLog } from './EventLog';
import { GameOver } from './GameOver';
import { PlayerCard } from './PlayerPanel';
import { PropertyCard } from './PropertyCard';
import { TradeDialog } from './TradeDialog';
import { Modal } from '../ui/Modal';
import { useMediaQuery } from '../../lib/useMediaQuery';

interface Props {
  room: RoomView;
  game: GameState;
  map: MapDefinition;
  legal: LegalActions | null;
  me: string | null;
  adsEnabled: boolean;
  entitlements: string[];
}

export function GameScreen({ room, game, map, legal, me, adsEnabled, entitlements }: Props) {
  const t = useT();
  const nav = useNavigate();
  const selectedTile = useGame((s) => s.selectedTile);
  const selectTile = useGame((s) => s.selectTile);
  const openTrade = useGame((s) => s.openTrade);
  const act = useGame((s) => s.act);
  const leave = useGame((s) => s.leaveRoom);
  const unread = useGame((s) => s.unreadChat);
  const lastEvents = useGame((s) => s.lastEvents);
  const [tab, setTab] = useState<'log' | 'chat'>('log');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [resignOpen, setResignOpen] = useState(false);
  const [rollKey, setRollKey] = useState(0);
  const desktop = useMediaQuery('(min-width: 1024px)');
  const myPlayer = me ? game.players.find((p) => p.id === me) : null;
  const isHost = !!me && room.hostId === me;

  useEffect(() => {
    if (lastEvents.some((e) => e.type === 'rolled')) setRollKey((k) => k + 1);
  }, [lastEvents]);

  const teleported = useMemo(
    () =>
      new Set(
        lastEvents
          .filter((e) => e.type === 'moved' && e.teleport)
          .map((e) => (e as { playerId: string }).playerId),
      ),
    [lastEvents],
  );
  const highlights = useMemo(
    () =>
      game.phase === 'awaitBuy' && game.pendingBuy !== null
        ? [game.pendingBuy]
        : game.auction
          ? [game.auction.tile]
          : [],
    [game.phase, game.pendingBuy, game.auction],
  );

  // Keyboard shortcuts: R roll, B buy, E end turn, Esc close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA')
        return;
      if (e.key === 'r' && legal?.roll) void act({ type: 'roll' });
      if (e.key === 'b' && legal?.buy) void act({ type: 'buy' });
      if (e.key === 'e' && legal?.endTurn) void act({ type: 'endTurn' });
      if (e.key === 't' && me) openTrade(null);
      if (e.key === 'Escape') selectTile(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [legal, act, selectTile, openTrade, me]);

  const current = game.players[game.current]!;
  const sidePanel = (
    <div className="panel flex h-full min-h-[14rem] flex-col p-2">
      <div className="mb-1 flex gap-1" role="tablist">
        <button
          role="tab"
          aria-selected={tab === 'log'}
          className={`btn btn-sm flex-1 ${tab === 'log' ? 'btn-secondary' : 'btn-ghost'}`}
          onClick={() => setTab('log')}
        >
          📜 {t('game.log')}
        </button>
        <button
          role="tab"
          aria-selected={tab === 'chat'}
          className={`btn btn-sm relative flex-1 ${tab === 'chat' ? 'btn-secondary' : 'btn-ghost'}`}
          onClick={() => setTab('chat')}
        >
          💬 {t('game.chat')}
          {unread > 0 && tab !== 'chat' && (
            <span className="absolute -top-1 -right-1 rounded-full bg-red-600 px-1.5 text-[10px] text-white">
              {unread}
            </span>
          )}
        </button>
      </div>
      <div className="min-h-0 flex-1">
        {tab === 'log' ? <EventLog game={game} map={map} me={me} /> : <Chat canSend={!!me} />}
      </div>
    </div>
  );

  return (
    <main
      id="main"
      className="mx-auto flex max-w-7xl flex-col gap-2 px-2 pt-[calc(var(--safe-top)+0.25rem)] pb-[calc(var(--safe-bottom)+5.5rem)] lg:grid lg:grid-cols-[16rem_minmax(0,1fr)_18rem] lg:items-start lg:gap-3 lg:pb-4"
      data-testid="game"
    >
      {/* Top bar */}
      <div className="flex items-center justify-between gap-2 lg:col-span-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-black">{room.code}</span>
          <span className="opacity-60">· {map.name}</span>
          {room.spectators > 0 && (
            <span className="text-xs opacity-60">· {t('game.spectators', { n: room.spectators })}</span>
          )}
          {game.rules.freeParkingJackpot && game.freeParkingPot > 0 && (
            <span className="rounded bg-yellow-200 px-1.5 text-xs">☕ {t('game.jackpot')}</span>
          )}
        </div>
        <div className="flex gap-1">
          {me && myPlayer && !myPlayer.bankrupt && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => openTrade(null)}
              data-testid="open-trade"
            >
              🤝 <span className="hidden sm:inline">{t('game.trade')}</span>
            </button>
          )}
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setSettingsOpen(true)}
            aria-label={t('app.settings')}
          >
            ⚙️
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              if (myPlayer && !myPlayer.bankrupt && game.status === 'playing') setResignOpen(true);
              else {
                void leave();
                nav('/');
              }
            }}
            aria-label={t('lobby.leave')}
          >
            🚪
          </button>
        </div>
      </div>

      {/* Players (left column on desktop, horizontal strip on mobile) */}
      <div
        className="flex gap-2 overflow-x-auto scrollbar-thin lg:flex-col lg:overflow-visible"
        data-testid="players"
      >
        {game.players.map((p) => (
          <PlayerCard
            key={p.id}
            player={p}
            game={game}
            map={map}
            isMe={p.id === me}
            isCurrent={p.id === current.id}
            compact={false}
          />
        ))}
      </div>

      {/* Board */}
      <div className="relative mx-auto w-full max-w-[min(100vw-1rem,calc(100dvh-14rem))] lg:max-w-[calc(100dvh-9rem)]">
        <Board
          map={map}
          game={game}
          selectedTile={selectedTile}
          onSelect={selectTile}
          highlights={highlights}
          teleported={teleported}
        >
          <div className="flex flex-col items-center gap-2 p-2 text-center text-white drop-shadow">
            <div className="text-[clamp(0.9rem,3cqw,1.6rem)] font-black tracking-tight">{map.name}</div>
            <Dice dice={game.dice} rollKey={rollKey} />
            <div className="text-[clamp(0.6rem,2cqw,0.9rem)] font-semibold opacity-90">
              {game.status === 'playing' ? t('game.turnOf', { name: current.name }) : ''}
            </div>
          </div>
          <CardReveal map={map} />
        </Board>
      </div>

      {/* Log/chat: right column on desktop, below the board on phones */}
      {desktop ? (
        <div className="h-[min(70vh,40rem)]">{sidePanel}</div>
      ) : (
        <div className="h-56">{sidePanel}</div>
      )}

      {/* Action bar (sticky bottom on mobile) */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-black/10 bg-white/95 p-2 backdrop-blur lg:static lg:col-span-3 lg:rounded-2xl lg:border"
        style={{ paddingBottom: 'calc(0.5rem + var(--safe-bottom))' }}
      >
        {me && <TradeDialog game={game} map={map} me={me} />}
        {game.phase === 'auction' ? (
          <AuctionPanel game={game} map={map} legal={legal} me={me} deadline={room.deadline} />
        ) : (
          <ActionBar game={game} map={map} legal={legal} me={me} deadline={room.deadline} />
        )}
      </div>

      <PropertyCard
        index={selectedTile}
        map={map}
        game={game}
        legal={legal}
        me={me}
        onClose={() => selectTile(null)}
      />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <Modal open={resignOpen} onClose={() => setResignOpen(false)} title={t('game.resign')} size="sm">
        <p className="mb-3 text-sm">{t('game.resignConfirm')}</p>
        <div className="flex justify-end gap-2">
          <button className="btn btn-secondary" onClick={() => setResignOpen(false)}>
            {t('app.cancel')}
          </button>
          <button
            className="btn btn-danger"
            onClick={() => {
              setResignOpen(false);
              void act({ type: 'resign' });
            }}
          >
            {t('game.resign')}
          </button>
        </div>
      </Modal>
      {game.status === 'ended' && (
        <GameOver
          game={game}
          map={map}
          me={me}
          isHost={isHost}
          adsEnabled={adsEnabled}
          entitlements={entitlements}
        />
      )}
    </main>
  );
}
