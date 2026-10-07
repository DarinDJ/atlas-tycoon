import type { MapDefinition } from '@bt/engine';
import { AnimatePresence, motion } from 'framer-motion';
import { cardText, deckName, useI18n } from '../../i18n';
import { useGame } from '../../store/useGame';

/** Shows the card the animator is currently revealing (see lib/animator.ts). */
export function CardReveal({ map }: { map: MapDefinition }) {
  const lang = useI18n((s) => s.lang);
  const card = useGame((s) => s.visual.card);
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
            className="game-card w-full max-w-[260px] rounded-2xl p-4 text-center shadow-2xl"
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
            <div className="text-sm font-semibold">{cardText(map, card.deck, card.id, lang)}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
