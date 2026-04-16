'use client';

import { type PropsWithChildren, useEffect } from 'react';

const isFormField = (value: EventTarget | null): value is HTMLElement =>
  value instanceof HTMLElement &&
  (value.matches('input, textarea, select') || value.isContentEditable);

const isScrollable = (element: HTMLElement) => {
  const style = window.getComputedStyle(element);
  const overflowY = style.overflowY;
  return (
    (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') &&
    element.scrollHeight > element.clientHeight + 8
  );
};

const findScrollContainer = (element: HTMLElement): HTMLElement | null => {
  let current = element.parentElement;

  while (current && current !== document.body) {
    if (current.classList.contains('ui-modal__body')) {
      return null;
    }

    if (isScrollable(current)) {
      return current;
    }

    current = current.parentElement;
  }

  return null;
};

const updateViewportVariables = () => {
  const root = document.documentElement;
  const viewport = window.visualViewport;
  const height = viewport?.height ?? window.innerHeight;
  const keyboardOffset = Math.max(
    0,
    window.innerHeight - height - (viewport?.offsetTop ?? 0),
  );

  root.style.setProperty('--viewport-height', `${height}px`);
  root.style.setProperty('--keyboard-offset', `${keyboardOffset}px`);
};

const revealField = (field: HTMLElement, behavior: ScrollBehavior) => {
  if (field.closest('.ui-modal__body')) {
    return;
  }

  const viewport = window.visualViewport;
  const viewportHeight = viewport?.height ?? window.innerHeight;
  const viewportTop = viewport?.offsetTop ?? 0;
  const visibleTop = viewportTop + 20;
  const visibleBottom = viewportTop + viewportHeight - 124;
  const container = findScrollContainer(field);

  window.requestAnimationFrame(() => {
    const fieldRect = field.getBoundingClientRect();

    if (container) {
      const containerRect = container.getBoundingClientRect();
      const boundedTop = Math.max(containerRect.top + 12, visibleTop);
      const boundedBottom = Math.min(containerRect.bottom - 12, visibleBottom);

      let nextScrollTop = container.scrollTop;

      if (fieldRect.top < boundedTop) {
        nextScrollTop -= boundedTop - fieldRect.top;
      } else if (fieldRect.bottom > boundedBottom) {
        nextScrollTop += fieldRect.bottom - boundedBottom;
      }

      container.scrollTo({
        top: Math.max(0, nextScrollTop),
        behavior,
      });
      return;
    }

    const pageTop = window.scrollY;
    let nextScrollY = pageTop;

    if (fieldRect.top < visibleTop) {
      nextScrollY -= visibleTop - fieldRect.top;
    } else if (fieldRect.bottom > visibleBottom) {
      nextScrollY += fieldRect.bottom - visibleBottom;
    }

    if (Math.abs(nextScrollY - pageTop) > 2) {
      window.scrollTo({
        top: Math.max(0, nextScrollY),
        behavior,
      });
    }
  });
};

export function MobileInputViewportProvider({ children }: PropsWithChildren) {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    const viewport = window.visualViewport;
    const scheduleReveal = (behavior: ScrollBehavior, delayMs: number) => {
      window.setTimeout(() => {
        const activeElement = document.activeElement;

        if (!isFormField(activeElement)) {
          return;
        }

        revealField(activeElement, behavior);
      }, delayMs);
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (!isFormField(event.target)) {
        return;
      }

      scheduleReveal('smooth', 120);
      scheduleReveal('auto', 320);
    };

    const handleInput = (event: Event) => {
      if (!isFormField(event.target)) {
        return;
      }

      revealField(event.target, 'auto');
    };

    const handleViewportShift = () => {
      updateViewportVariables();
      scheduleReveal('auto', 40);
    };

    updateViewportVariables();
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('input', handleInput);
    viewport?.addEventListener('resize', handleViewportShift);
    viewport?.addEventListener('scroll', handleViewportShift);
    window.addEventListener('resize', handleViewportShift);
    window.addEventListener('orientationchange', handleViewportShift);

    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('input', handleInput);
      viewport?.removeEventListener('resize', handleViewportShift);
      viewport?.removeEventListener('scroll', handleViewportShift);
      window.removeEventListener('resize', handleViewportShift);
      window.removeEventListener('orientationchange', handleViewportShift);
      document.documentElement.style.removeProperty('--viewport-height');
      document.documentElement.style.removeProperty('--keyboard-offset');
    };
  }, []);

  return children;
}
