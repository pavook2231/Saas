'use client';

import { Portal } from '@headlessui/react';
import {
  AnimatePresence,
  LayoutGroup,
  MotionConfig,
  motion,
  useReducedMotion,
} from 'framer-motion';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

type ToastTone = 'success' | 'error' | 'info';

type ToastRecord = {
  id: string;
  tone: ToastTone;
  title: string;
  message: string;
  durationMs: number;
};

type ToastContextValue = {
  showToast: (input: {
    tone?: ToastTone;
    title?: string;
    message: string;
    durationMs?: number;
  }) => string;
  success: (message: string, title?: string) => string;
  error: (message: string, title?: string) => string;
  info: (message: string, title?: string) => string;
  dismissToast: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const defaultTitles: Record<ToastTone, string> = {
  success: 'Готово',
  error: 'Ошибка',
  info: 'Информация',
};

const toneIcons: Record<ToastTone, string> = {
  success: '✓',
  error: '!',
  info: 'i',
};

const buildToastId = () => `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export function ToastProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const prefersReducedMotion = useReducedMotion();

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback<ToastContextValue['showToast']>(
    ({ tone = 'info', title, message, durationMs = 3600 }) => {
      const id = buildToastId();

      setToasts((current) => [
        ...current,
        {
          id,
          tone,
          title: title?.trim() || defaultTitles[tone],
          message,
          durationMs,
        },
      ]);

      return id;
    },
    [],
  );

  const success = useCallback(
    (message: string, title = defaultTitles.success) =>
      showToast({ tone: 'success', title, message }),
    [showToast],
  );

  const error = useCallback(
    (message: string, title = defaultTitles.error) =>
      showToast({ tone: 'error', title, message, durationMs: 4800 }),
    [showToast],
  );

  const info = useCallback(
    (message: string, title = defaultTitles.info) =>
      showToast({ tone: 'info', title, message }),
    [showToast],
  );

  useEffect(() => {
    if (toasts.length === 0) {
      return;
    }

    const timers = toasts.map((toast) =>
      window.setTimeout(() => {
        dismissToast(toast.id);
      }, toast.durationMs),
    );

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [dismissToast, toasts]);

  const value = useMemo<ToastContextValue>(
    () => ({
      showToast,
      success,
      error,
      info,
      dismissToast,
    }),
    [dismissToast, error, info, showToast, success],
  );

  return (
    <ToastContext.Provider value={value}>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
      <Portal>
        <div className="toast-viewport" aria-live="polite" aria-atomic="true">
          <LayoutGroup>
            <AnimatePresence initial={false}>
              {toasts.map((toast) => (
                <motion.article
                  key={toast.id}
                  layout
                  initial={
                    prefersReducedMotion
                      ? { opacity: 0 }
                      : { opacity: 0, y: 14, scale: 0.98 }
                  }
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={
                    prefersReducedMotion
                      ? { opacity: 0 }
                      : { opacity: 0, y: -8, scale: 0.98 }
                  }
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  className={`toast toast--${toast.tone}`}
                >
                  <div className="toast__icon" aria-hidden="true">
                    {toneIcons[toast.tone]}
                  </div>
                  <div className="toast__copy">
                    <strong>{toast.title}</strong>
                    <p>{toast.message}</p>
                  </div>
                  <button
                    type="button"
                    className="toast__close"
                    onClick={() => dismissToast(toast.id)}
                    aria-label="Закрыть уведомление"
                  >
                    ×
                  </button>
                </motion.article>
              ))}
            </AnimatePresence>
          </LayoutGroup>
        </div>
      </Portal>
    </ToastContext.Provider>
  );
}

export const useToast = (): ToastContextValue => {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }

  return context;
};
