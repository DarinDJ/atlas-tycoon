import { useEffect, useRef } from 'react';
import { useSettings } from '../store/useSettings';

/** Lightweight canvas confetti (no dependency). */
export function Confetti({
  run,
  colors = ['#ff7a1a', '#128807', '#1d4ed8', '#f2c60a', '#d6409b', '#ffffff'],
}: {
  run: boolean;
  colors?: string[];
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useSettings((s) => s.reducedMotion);
  useEffect(() => {
    if (!run || reduced) return;
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
    };
    resize();
    window.addEventListener('resize', resize);
    const N = 160;
    const parts = Array.from({ length: N }, () => ({
      x: Math.random() * canvas.width,
      y: -Math.random() * canvas.height * 0.5,
      vx: (Math.random() - 0.5) * 3 * dpr,
      vy: (2 + Math.random() * 3) * dpr,
      w: (6 + Math.random() * 6) * dpr,
      h: (8 + Math.random() * 8) * dpr,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.2,
      c: colors[Math.floor(Math.random() * colors.length)]!,
    }));
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        p.r += p.vr;
        p.vy += 0.03 * dpr;
        if (p.y > canvas.height + 20) {
          p.y = -20;
          p.x = Math.random() * canvas.width;
        }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (now - start < 6000) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [run, reduced, colors]);
  if (!run) return null;
  return <canvas ref={ref} className="pointer-events-none fixed inset-0 z-[70] h-full w-full" aria-hidden />;
}
