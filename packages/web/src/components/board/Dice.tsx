import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useSettings } from '../../store/useSettings';

/** Rotation that brings each face (1..6) to the front of the cube. */
const FACE_ROT: Record<number, { x: number; y: number }> = {
  1: { x: 0, y: 0 },
  2: { x: 0, y: -90 },
  3: { x: 0, y: 180 },
  4: { x: 0, y: 90 },
  5: { x: -90, y: 0 },
  6: { x: 90, y: 0 },
};

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [2, 6],
  3: [2, 4, 6],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function Face({ value, transform }: { value: number; transform: string }) {
  const pips = PIPS[value] ?? [];
  return (
    <div className="die-face" style={{ transform }} aria-hidden>
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className="pip" style={{ visibility: pips.includes(i) ? 'visible' : 'hidden' }} />
      ))}
    </div>
  );
}

function Cube({ value, rolling, delay }: { value: number; rolling: boolean; delay: number }) {
  const reduced = useSettings((s) => s.reducedMotion);
  const target = FACE_ROT[value] ?? FACE_ROT[1]!;
  // Add full spins so every roll visibly tumbles, then land exactly on the target face.
  const spins = rolling && !reduced ? 2 : 0;
  return (
    <motion.div
      className="die"
      initial={false}
      animate={{
        rotateX: target.x + spins * 360 * (value % 2 ? 1 : -1),
        rotateY: target.y + spins * 360,
        y: rolling && !reduced ? [0, -34, 0, -10, 0] : 0,
      }}
      transition={
        rolling && !reduced
          ? {
              rotateX: { duration: 0.85, ease: [0.2, 0.9, 0.3, 1], delay },
              rotateY: { duration: 0.85, ease: [0.2, 0.9, 0.3, 1], delay },
              y: { duration: 0.85, delay },
            }
          : { duration: 0.2 }
      }
    >
      <Face value={1} transform="rotateY(0deg) translateZ(var(--die-half))" />
      <Face value={2} transform="rotateY(90deg) translateZ(var(--die-half))" />
      <Face value={3} transform="rotateY(180deg) translateZ(var(--die-half))" />
      <Face value={4} transform="rotateY(-90deg) translateZ(var(--die-half))" />
      <Face value={5} transform="rotateX(90deg) translateZ(var(--die-half))" />
      <Face value={6} transform="rotateX(-90deg) translateZ(var(--die-half))" />
    </motion.div>
  );
}

interface Props {
  dice: [number, number] | null;
  /** Increments on every roll so identical values still tumble. */
  rollKey: number;
  size?: 'sm' | 'md';
}

/** Two 3D dice that tumble for ~0.9 s and settle on the real values. */
export function Dice({ dice, rollKey, size = 'md' }: Props) {
  const [rolling, setRolling] = useState(false);
  useEffect(() => {
    if (!dice || rollKey === 0) return;
    setRolling(true);
    const id = setTimeout(() => setRolling(false), 950);
    return () => clearTimeout(id);
  }, [rollKey, dice]);
  if (!dice) return null;
  return (
    <div
      className={`dice-stage flex items-center justify-center gap-5 ${size === 'sm' ? 'scale-75' : ''}`}
      role="img"
      aria-label={`Dice: ${dice[0]} and ${dice[1]}`}
      data-testid="dice"
      data-rolling={rolling}
    >
      <Cube value={dice[0]} rolling={rolling} delay={0} />
      <Cube value={dice[1]} rolling={rolling} delay={0.08} />
    </div>
  );
}
