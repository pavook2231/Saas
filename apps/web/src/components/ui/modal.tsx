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
  panelClassName?: string;
}>;

export function Modal({
  open,
  title,
  description,
  onClose,
  footer,
  size = 'md',
  panelClassName,
  children,
}: ModalProps) {
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (!open || typeof document === 'undefined') {
      return;
    }

    const { body, documentElement } = document;
    const nextLockCount = Number(body.dataset.modalLockCount ?? '0') + 1;
    body.dataset.modalLockCount = String(nextLockCount);

    if (nextLockCount === 1) {
      const scrollY = window.scrollY;
      body.dataset.modalScrollY = String(scrollY);
      body.classList.add('is-scroll-locked');
      body.style.position = 'fixed';
      body.style.top = `-${scrollY}px`;
      body.style.left = '0';
      body.style.right = '0';
      body.style.width = '100%';
      body.style.overflow = 'hidden';
      documentElement.style.overflow = 'hidden';
    }

    return () => {
      const currentCount = Number(body.dataset.modalLockCount ?? '1') - 1;

      if (currentCount <= 0) {
        const storedScrollY = Number(body.dataset.modalScrollY ?? '0');
        delete body.dataset.modalLockCount;
        delete body.dataset.modalScrollY;
        body.classList.remove('is-scroll-locked');
        body.style.position = '';
        body.style.top = '';
        body.style.left = '';
        body.style.right = '';
        body.style.width = '';
        body.style.overflow = '';
        documentElement.style.overflow = '';
        window.scrollTo(0, storedScrollY);
      } else {
        body.dataset.modalLockCount = String(currentCount);
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open || typeof document === 'undefined') {
      return;
    }

    const root = document.documentElement;
    const viewport = window.visualViewport;
    const updateViewportHeight = () => {
      const height = viewport?.height ?? window.innerHeight;
      root.style.setProperty('--viewport-height', `${height}px`);
    };

    updateViewportHeight();
    viewport?.addEventListener('resize', updateViewportHeight);
    window.addEventListener('orientationchange', updateViewportHeight);

    return () => {
      viewport?.removeEventListener('resize', updateViewportHeight);
      window.removeEventListener('orientationchange', updateViewportHeight);
      root.style.removeProperty('--viewport-height');
    };
  }, [open]);

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
            className={cn('ui-modal__panel', `ui-modal__panel--${size}`, panelClassName)}
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
                <span aria-hidden="true">×</span>
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

