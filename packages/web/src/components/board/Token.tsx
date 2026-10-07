import { animate, motion, useMotionTemplate, useMotionValue } from 'framer-motion';
import { useEffect, useRef } from 'react';
import type { TileGeom } from '../../lib/board';
import { pathBetween } from '../../lib/board';
import { sfx } from '../../lib/audio';
import { useSettings } from '../../store/useSettings';

interface Props {
  playerId: string;
  glyph: string;
  color: string;
  position: number;
  /** Set when the last move was a teleport (jail) so we do not hop around the board. */
  teleport: boolean;
  geoms: TileGeom[];
  dx: number;
  dy: number;
  active: boolean;
  dimmed: boolean;
}

/** A player token that hops tile-to-tile when its position changes. */
export function Token({ glyph, color, position, teleport, geoms, dx, dy, active, dimmed, playerId }: Props) {
  const reduced = useSettings((s) => s.reducedMotion);
  const x = useMotionValue((geoms[position]?.cx ?? 0) * 100);
  const y = useMotionValue((geoms[position]?.cy ?? 0) * 100);
  const scale = useMotionValue(1);
  const left = useMotionTemplate`${x}%`;
  const top = useMotionTemplate`${y}%`;
  const prev = useRef(position);

  useEffect(() => {
    const from = prev.current;
    prev.current = position;
    if (from === position) return;
    const n = geoms.length;
    const target = geoms[position]!;
    if (reduced || teleport) {
      x.set(target.cx * 100);
      y.set(target.cy * 100);
      return;
    }
    const forward = pathBetween(from, position, n);
    const back = (from - position + n) % n;
    // Short backwards moves (cards like "go back 3") walk backwards instead of around the board.
    const hops =
      back <= 3 && forward.length > 3
        ? Array.from({ length: back }, (_, i) => (from - i - 1 + n) % n)
        : forward;
    const per = Math.max(0.07, Math.min(0.2, 1.8 / Math.max(1, hops.length)));
    let cancelled = false;
    (async () => {
      for (const i of hops) {
        if (cancelled) return;
        const g = geoms[i]!;
        sfx.play('move');
        await Promise.all([
          animate(x, g.cx * 100, { duration: per, ease: 'easeInOut' }),
          animate(y, g.cy * 100, { duration: per, ease: 'easeInOut' }),
          animate(scale, [1, 1.3, 1], { duration: per }),
        ]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [position, teleport, geoms, reduced, x, y, scale]);

  return (
    <motion.div
      className={`token ${active ? 'pulse' : ''}`}
      data-token={playerId}
      style={{
        left,
        top,
        x: `calc(-50% + ${dx * 100}cqw)`,
        y: `calc(-50% + ${dy * 100}cqw)`,
        scale,
        borderColor: color,
        background: `color-mix(in srgb, ${color} 25%, white)`,
        opacity: dimmed ? 0.35 : 1,
        zIndex: active ? 6 : 5,
      }}
      aria-hidden
    >
      <span>{glyph}</span>
    </motion.div>
  );
}
