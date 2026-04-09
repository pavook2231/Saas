import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { ru } from './lib/i18n/ru';
import { AuthProvider } from './providers/auth-provider';
import { ToastProvider } from './providers/toast-provider';
import { WorkspaceProvider } from './providers/workspace-provider';

export const metadata: Metadata = {
  title: ru.metadata.title,
  description: ru.metadata.description,
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
      { url: '/icons/icon-512.svg', sizes: '512x512', type: 'image/svg+xml' },
    ],
    apple: [{ url: '/icons/icon-192.svg', type: 'image/svg+xml' }],
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
          <AuthProvider>
            <WorkspaceProvider>{children}</WorkspaceProvider>
          </AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
