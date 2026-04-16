import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { ru } from './lib/i18n/ru';
import { AuthProvider } from './providers/auth-provider';
import { MobileInputViewportProvider } from './providers/mobile-input-viewport-provider';
import { PwaInstallProvider } from './providers/pwa-install-provider';
import { ToastProvider } from './providers/toast-provider';
import { WorkspaceProvider } from './providers/workspace-provider';

export const metadata: Metadata = {
  title: ru.metadata.title,
  description: ru.metadata.description,
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [{ url: '/calendar-icon', sizes: '512x512', type: 'image/png' }],
    apple: [{ url: '/calendar-apple-icon', sizes: '180x180', type: 'image/png' }],
  },
};

type LayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: LayoutProps) {
  return (
    <html lang="ru">
      <body>
        <ToastProvider>
          <PwaInstallProvider>
            <MobileInputViewportProvider>
              <AuthProvider>
                <WorkspaceProvider>{children}</WorkspaceProvider>
              </AuthProvider>
            </MobileInputViewportProvider>
          </PwaInstallProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
