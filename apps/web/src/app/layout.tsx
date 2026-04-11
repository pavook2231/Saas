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
      { url: '/icon?v=calendar-hierarchy-20260411b', type: 'image/png' },
      { url: '/icons/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
      { url: '/icons/icon-512.svg', sizes: '512x512', type: 'image/svg+xml' },
    ],
    apple: [{ url: '/apple-icon?v=calendar-hierarchy-20260411b', sizes: '180x180', type: 'image/png' }],
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
