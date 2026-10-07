import type { GameState, MapDefinition } from '@bt/engine';
import { useEffect, useRef } from 'react';
import { describeEvent, useI18n, useT } from '../../i18n';

export function EventLog({ game, map, me }: { game: GameState; map: MapDefinition; me: string | null }) {
  const lang = useI18n((s) => s.lang);
  const t = useT();
  const ref = useRef<HTMLOListElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [game.log.length]);
  const lines = game.log
    .map((entry) => ({
      key: `${entry.seq}-${entry.turn}-${entry.event.type}`,
      turn: entry.turn,
      text: describeEvent(entry.event, game, map, lang, me),
      type: entry.event.type,
    }))
    .filter((l) => l.text);
  return (
    <ol
      ref={ref}
      className="flex h-full flex-col gap-0.5 overflow-y-auto text-xs scrollbar-thin"
      aria-label={t('game.log')}
      aria-live="polite"
      data-testid="event-log"
    >
      {lines.slice(-120).map((l, i) => (
        <li
          key={`${l.key}-${i}`}
          className={`rounded px-1.5 py-0.5 ${l.type === 'bankrupt' || l.type === 'gameOver' ? 'bg-red-50 font-bold' : l.type === 'cardDrawn' ? 'bg-yellow-50' : ''}`}
        >
          <span className="mr-1 opacity-40">T{l.turn}</span>
          {l.text}
        </li>
      ))}
    </ol>
  );
}
