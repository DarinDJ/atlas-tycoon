import { AnimatePresence, motion } from 'framer-motion';
import { useGame } from '../../store/useGame';

export function Toasts() {
  const toasts = useGame((s) => s.toasts);
  const dismiss = useGame((s) => s.dismissToast);
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-[calc(var(--safe-top)+0.5rem)] z-[60] flex flex-col items-center gap-2 px-4"
      aria-live="polite"
    >
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.button
            key={t.id}
            initial={{ opacity: 0, y: -12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8 }}
            onClick={() => dismiss(t.id)}
            className={`pointer-events-auto max-w-sm rounded-xl px-4 py-2.5 text-sm font-semibold shadow-lg ${
              t.kind === 'error'
                ? 'bg-red-600 text-white'
                : t.kind === 'success'
                  ? 'bg-emerald-500 text-white'
                  : 'bg-[var(--panel-muted)] text-white'
            }`}
          >
            {t.text}
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
