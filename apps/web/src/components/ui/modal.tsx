'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, type PropsWithChildren, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/lib/cn';

type ModalProps = PropsWithChildren<{
  open: boolean;
  title?: string;
  description?: string;
  onClose: () => void;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}>;

export function Modal({
  open,
  title,
  description,
  onClose,
  footer,
  size = 'md',
  children,
}: ModalProps) {
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="ui-modal" role="dialog" aria-modal="true">
          <motion.button
            className="ui-modal__backdrop"
            type="button"
            aria-label="Закрыть"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          />
          <motion.div
            className={cn('ui-modal__panel', `ui-modal__panel--${size}`)}
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="ui-modal__header">
              <div>
                {title ? <h3>{title}</h3> : null}
                {description ? <p>{description}</p> : null}
              </div>
              <button
                className="ui-modal__close"
                type="button"
                aria-label="Закрыть"
                onClick={onClose}
              >
                x
              </button>
            </div>
            <div className="ui-modal__body">{children}</div>
            {footer ? <div className="ui-modal__footer">{footer}</div> : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

