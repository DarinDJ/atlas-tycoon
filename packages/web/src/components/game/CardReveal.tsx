import type { GameEvent, MapDefinition } from '@bt/engine';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { cardText, deckName, useI18n } from '../../i18n';
import { sfx } from '../../lib/audio';
import { useGame } from '../../store/useGame';

/**
 * Watches the event queue and plays the "flavour" layer: dice sound, card flips, cash sounds.
 * The authoritative state has already changed; this only drives animations.
 */
export function CardReveal({ map }: { map: MapDefinition }) {
  const lang = useI18n((s) => s.lang);
  const queue = useGame((s) => s.eventQueue);
  const consume = useGame((s) => s.consumeEvents);
  const me = useGame((s) => s.me);
  const [card, setCard] = useState<{ deck: 'luck' | 'treasure'; id: string } | null>(null);

  useEffect(() => {
    if (queue.length === 0) return;
    const batch = consume();
    if (!batch) return;
    let delay = 0;
    for (const ev of batch.events) {
      delay += handleEvent(ev, me, delay, (c) => setCard(c));
    }
  }, [queue, consume, me]);

  useEffect(() => {
    if (!card) return;
    const id = setTimeout(() => setCard(null), 3800);
    return () => clearTimeout(id);
  }, [card]);

  return (
    <AnimatePresence>
      {card && (
        <motion.div
          key={card.id + card.deck}
          className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="w-full max-w-[260px] rounded-2xl bg-white p-4 text-center shadow-2xl"
            initial={{ rotateY: 90, scale: 0.8 }}
            animate={{ rotateY: 0, scale: 1 }}
            exit={{ rotateY: -90, scale: 0.8 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
            style={{
              borderTop: `8px solid ${card.deck === 'luck' ? map.theme.primary : map.theme.secondary}`,
            }}
            data-testid="card-reveal"
          >
            <div className="mb-1 text-xs font-black tracking-widest uppercase opacity-60">
              {card.deck === 'luck' ? '🎲' : '💰'} {deckName(map, card.deck, lang)}
            </div>
            <div className="text-sm font-semibold text-ink">{cardText(map, card.deck, card.id, lang)}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Returns extra delay (ms) to add before the next event's effects. */
function handleEvent(
  ev: GameEvent,
  me: string | null,
  delay: number,
  showCard: (c: { deck: 'luck' | 'treasure'; id: string }) => void,
): number {
  const later = (fn: () => void) => setTimeout(fn, delay);
  switch (ev.type) {
    case 'rolled':
      if (ev.playerId !== me) later(() => sfx.play('dice'));
      return 0;
    case 'cardDrawn':
      later(() => {
        sfx.play('card');
        showCard({ deck: ev.deck, id: ev.cardId });
      });
      return 600;
    case 'paid':
      if (ev.to === me) later(() => sfx.play('cash'));
      else if (ev.from === me) later(() => sfx.play('pay'));
      return 0;
    case 'salary':
      if (ev.playerId === me) later(() => sfx.play('cash'));
      return 0;
    case 'bought':
      later(() => sfx.play('buy'));
      return 0;
    case 'built':
      later(() => sfx.play('build'));
      return 0;
    case 'jailed':
      later(() => sfx.play('jail'));
      return 0;
    case 'auctionStarted':
    case 'bid':
      later(() => sfx.play('auction'));
      return 0;
    case 'tradeProposed':
      if (ev.to === me) later(() => sfx.play('trade'));
      return 0;
    case 'tradeAccepted':
      later(() => sfx.play('trade'));
      return 0;
    case 'turnStarted':
      if (ev.playerId === me) later(() => sfx.play('notify'));
      return 0;
    case 'gameOver':
      later(() => sfx.play(ev.winner === me ? 'win' : 'lose'));
      return 0;
    default:
      return 0;
  }
}
