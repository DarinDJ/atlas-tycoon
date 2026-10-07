import type { GameEvent } from '@bt/engine';
import { sfx } from './audio';
import { useGame } from '../store/useGame';
import { useSettings } from '../store/useSettings';

/**
 * Replays server event batches as a timed sequence so the board tells the story in order:
 * dice tumble -> pawn hops -> card flips -> cash sounds. The authoritative state is already
 * updated; this only drives the `visual` slice of the store.
 */
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

let running = false;
let started = false;

export function startAnimator(): void {
  if (started) return;
  started = true;
  useGame.subscribe((s, prev) => {
    if (s.eventQueue.length > 0 && s.eventQueue !== prev.eventQueue) void pump();
  });
}

async function pump(): Promise<void> {
  if (running) return;
  running = true;
  const store = useGame.getState;
  store().setVisual({ busy: true });
  try {
    for (;;) {
      const batch = store().consumeEvents();
      if (!batch) break;
      const reduced = useSettings.getState().reducedMotion;
      const speed = reduced ? 0 : 1;
      for (const ev of batch.events) await play(ev, speed);
    }
  } finally {
    running = false;
    // Catch up with anything that changed while we were animating (e.g. bots moved several times).
    const g = store().game;
    if (g) {
      const v = store().visual;
      const positions = { ...v.positions };
      for (const p of g.players) positions[p.id] = p.position;
      store().setVisual({ positions, busy: false });
    } else store().setVisual({ busy: false });
  }
}

const n = () => useGame.getState().map?.tiles.length ?? 40;

async function play(ev: GameEvent, speed: number): Promise<void> {
  const { setVisual } = useGame.getState();
  const me = useGame.getState().me;
  const v = () => useGame.getState().visual;
  switch (ev.type) {
    case 'rolled': {
      sfx.play('dice');
      setVisual({ dice: ev.dice, rollKey: v().rollKey + 1 });
      await sleep(950 * speed);
      return;
    }
    case 'moved': {
      const from = v().positions[ev.playerId] ?? ev.from;
      const hops = ev.teleport ? 0 : (ev.to - from + n()) % n();
      setVisual({
        positions: { ...v().positions, [ev.playerId]: ev.to },
        teleport: { ...v().teleport, [ev.playerId]: !!ev.teleport },
      });
      if (ev.teleport) await sleep(500 * speed);
      else await sleep(Math.min(1700, hops * 110 + 180) * speed);
      return;
    }
    case 'salary':
      if (ev.playerId === me) sfx.play('cash');
      return;
    case 'cardDrawn': {
      sfx.play('card');
      setVisual({ card: { deck: ev.deck, id: ev.cardId } });
      await sleep(1700 * speed);
      setTimeout(() => {
        const cur = useGame.getState().visual.card;
        if (cur && cur.id === ev.cardId) useGame.getState().setVisual({ card: null });
      }, 2200);
      return;
    }
    case 'paid':
      if (ev.to === me) sfx.play('cash');
      else if (ev.from === me) sfx.play('pay');
      await sleep(120 * speed);
      return;
    case 'bought':
      sfx.play('buy');
      await sleep(250 * speed);
      return;
    case 'built':
      sfx.play('build');
      return;
    case 'jailed':
      sfx.play('jail');
      await sleep(400 * speed);
      return;
    case 'auctionStarted':
    case 'bid':
      sfx.play('auction');
      return;
    case 'tradeProposed':
      if (ev.to === me) sfx.play('trade');
      return;
    case 'tradeAccepted':
      sfx.play('trade');
      return;
    case 'turnStarted':
      if (ev.playerId === me) sfx.play('notify');
      return;
    case 'bankrupt':
      sfx.play('lose');
      await sleep(300 * speed);
      return;
    case 'gameOver':
      await sleep(600 * speed);
      sfx.play(ev.winner === me ? 'win' : 'lose');
      return;
    default:
      return;
  }
}
