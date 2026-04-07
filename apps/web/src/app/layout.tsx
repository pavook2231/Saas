import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { ru } from './lib/i18n/ru';
import { AuthProvider } from './providers/auth-provider';
import { WorkspaceProvider } from './providers/workspace-provider';

export const metadata: Metadata = {
  title: ru.metadata.title,
  description: ru.metadata.description,
};

type LayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: LayoutProps) {
  return (
    <html lang="ru">
      <body>
        <AuthProvider>
          <WorkspaceProvider>{children}</WorkspaceProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
