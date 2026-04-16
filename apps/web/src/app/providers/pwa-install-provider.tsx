'use client';

import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
};

type PwaInstallContextValue = {
  installPromptEvent: BeforeInstallPromptEvent | null;
  standaloneMode: boolean;
};

const PwaInstallContext = createContext<PwaInstallContextValue | null>(null);

const getStandaloneMode = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
};

export function PwaInstallProvider({ children }: PropsWithChildren) {
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [standaloneMode, setStandaloneMode] = useState(getStandaloneMode);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const syncStandaloneMode = () => {
      setStandaloneMode(getStandaloneMode());
    };

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPromptEvent(event as BeforeInstallPromptEvent);
      syncStandaloneMode();
    };

    const handleInstalled = () => {
      setInstallPromptEvent(null);
      syncStandaloneMode();
    };

    syncStandaloneMode();
    mediaQuery.addEventListener('change', syncStandaloneMode);
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      mediaQuery.removeEventListener('change', syncStandaloneMode);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const value = useMemo(
    () => ({
      installPromptEvent,
      standaloneMode,
    }),
    [installPromptEvent, standaloneMode],
  );

  return <PwaInstallContext.Provider value={value}>{children}</PwaInstallContext.Provider>;
}

export const usePwaInstallPrompt = () => {
  const context = useContext(PwaInstallContext);

  if (!context) {
    throw new Error('usePwaInstallPrompt must be used within PwaInstallProvider');
  }

  return context;
};
