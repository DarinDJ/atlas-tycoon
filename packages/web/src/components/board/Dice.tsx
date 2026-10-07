import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useSettings } from '../../store/useSettings';

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function Face({ value }: { value: number }) {
  const pips = PIPS[value] ?? [];
  return (
    <div className="dice-face" aria-hidden>
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className="pip" style={{ visibility: pips.includes(i) ? 'visible' : 'hidden' }} />
      ))}
    </div>
  );
}

interface Props {
  dice: [number, number] | null;
  /** Increments every roll so the same values still animate. */
  rollKey: number;
  size?: 'sm' | 'md';
}

/** Two dice that tumble for ~700ms then settle on the real values. */
export function Dice({ dice, rollKey, size = 'md' }: Props) {
  const reduced = useSettings((s) => s.reducedMotion);
  const [shown, setShown] = useState<[number, number]>(dice ?? [1, 1]);
  const [rolling, setRolling] = useState(false);
  useEffect(() => {
    if (!dice) return;
    if (reduced) {
      setShown(dice);
      return;
    }
    setRolling(true);
    let n = 0;
    const id = window.setInterval(() => {
      setShown([1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]);
      if (++n >= 9) {
        window.clearInterval(id);
        setShown(dice);
        setRolling(false);
      }
    }, 75);
    return () => window.clearInterval(id);
  }, [rollKey, dice, reduced]);

  if (!dice) return null;
  const label = `Dice: ${dice[0]} and ${dice[1]}`;
  return (
    <div
      className={`flex items-center gap-3 ${size === 'sm' ? 'scale-75' : ''}`}
      role="img"
      aria-label={label}
    >
      {[0, 1].map((i) => (
        <motion.div
          key={`${i}-${rollKey}`}
          initial={reduced ? false : { rotate: -200, y: -40, scale: 0.6 }}
          animate={
            rolling
              ? { rotate: [0, 140, -120, 360], y: [0, -16, 0], scale: [0.9, 1.1, 1] }
              : { rotate: 0, y: 0, scale: 1 }
          }
          transition={
            rolling ? { duration: 0.7, ease: 'easeOut' } : { type: 'spring', stiffness: 300, damping: 18 }
          }
        >
          <Face value={shown[i]!} />
        </motion.div>
      ))}
    </div>
  );
}
