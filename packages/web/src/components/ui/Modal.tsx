import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose?: () => void;
  title?: ReactNode;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** Keep the modal open even when clicking the backdrop (e.g. forced decisions). */
  persistent?: boolean;
}

/** Accessible modal: focus trap-lite, Esc to close, scroll lock, bottom-sheet on phones. */
export function Modal({ open, onClose, title, children, size = 'md', persistent }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !persistent) onClose?.();
      if (e.key === 'Tab' && ref.current) {
        const focusables = ref.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0]!;
        const last = focusables[focusables.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    setTimeout(() => ref.current?.querySelector<HTMLElement>('button, input, select, textarea')?.focus(), 30);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prev?.focus?.();
    };
  }, [open, onClose, persistent]);

  const width = size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-3xl' : 'max-w-lg';
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !persistent) onClose?.();
          }}
        >
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === 'string' ? title : undefined}
            className={`panel max-h-[92dvh] w-full overflow-y-auto rounded-b-none p-4 sm:rounded-2xl ${width}`}
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 30, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            style={{ paddingBottom: 'calc(1rem + var(--safe-bottom))' }}
          >
            {(title || onClose) && (
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold">{title}</h2>
                {onClose && !persistent && (
                  <button className="btn btn-ghost btn-sm -mr-2" onClick={onClose} aria-label="Close">
                    ✕
                  </button>
                )}
              </div>
            )}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  id?: string;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-1.5" htmlFor={id}>
      <span className="text-sm">{label}</span>
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? 'bg-leaf' : 'bg-gray-300'}`}
      >
        <span
          className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${checked ? 'left-[1.4rem]' : 'left-0.5'}`}
        />
      </button>
    </label>
  );
}
