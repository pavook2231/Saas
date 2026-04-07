'use client';

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

  if (!open || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div className="ui-modal" role="dialog" aria-modal="true">
      <button className="ui-modal__backdrop" type="button" aria-label="Закрыть" onClick={onClose} />
      <div className={cn('ui-modal__panel', `ui-modal__panel--${size}`)}>
        <div className="ui-modal__header">
          <div>
            {title ? <h3>{title}</h3> : null}
            {description ? <p>{description}</p> : null}
          </div>
          <button className="ui-modal__close" type="button" aria-label="Закрыть" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="ui-modal__body">{children}</div>
        {footer ? <div className="ui-modal__footer">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
