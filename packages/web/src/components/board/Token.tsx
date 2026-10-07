import { animate, motion, useMotionTemplate, useMotionValue } from 'framer-motion';
import { useEffect, useRef } from 'react';
import type { TileGeom } from '../../lib/board';
import { pathBetween } from '../../lib/board';
import { sfx } from '../../lib/audio';
import { useSettings } from '../../store/useSettings';
import { Pawn } from '../Pawn';

interface Props {
  playerId: string;
  avatar: string;
  skin: string;
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

/** A pawn that hops tile-to-tile when its (visual) position changes. */
export function Token({
  playerId,
  avatar,
  skin,
  color,
  position,
  teleport,
  geoms,
  dx,
  dy,
  active,
  dimmed,
}: Props) {
  const reduced = useSettings((s) => s.reducedMotion);
  const x = useMotionValue((geoms[position]?.cx ?? 0) * 100);
  const y = useMotionValue((geoms[position]?.cy ?? 0) * 100);
  const lift = useMotionValue(0);
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
      void animate(x, target.cx * 100, { duration: reduced ? 0 : 0.45, ease: 'easeInOut' });
      void animate(y, target.cy * 100, { duration: reduced ? 0 : 0.45, ease: 'easeInOut' });
      if (!reduced) void animate(lift, [0, -18, 0], { duration: 0.45 });
      return;
    }
    const forward = pathBetween(from, position, n);
    const back = (from - position + n) % n;
    // Short backwards moves (cards like "go back 3") walk backwards instead of around the board.
    const hops =
      back <= 3 && forward.length > 3
        ? Array.from({ length: back }, (_, i) => (from - i - 1 + n) % n)
        : forward;
    const per = 0.11;
    let cancelled = false;
    (async () => {
      for (const i of hops) {
        if (cancelled) return;
        const g = geoms[i]!;
        sfx.play('move');
        await Promise.all([
          animate(x, g.cx * 100, { duration: per, ease: 'easeInOut' }),
          animate(y, g.cy * 100, { duration: per, ease: 'easeInOut' }),
          animate(lift, [0, -9, 0], { duration: per, ease: 'easeOut' }),
        ]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [position, teleport, geoms, reduced, x, y, lift]);

  return (
    <motion.div
      className={`token ${active ? 'token-active' : ''}`}
      data-token={playerId}
      style={{
        left,
        top,
        x: `calc(-50% + ${dx * 100}cqw)`,
        y: `calc(-50% + ${dy * 100}cqw)`,
        translateY: lift,
        opacity: dimmed ? 0.4 : 1,
        zIndex: active ? 6 : 5,
      }}
    >
      <Pawn avatar={avatar} color={color} skin={skin} size={0} className="token-pawn" />
    </motion.div>
  );
}
