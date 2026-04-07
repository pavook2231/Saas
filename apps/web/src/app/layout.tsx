import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Платформа управления организациями',
  description: 'Платформа для управления организациями, расписанием и участниками',
};

type LayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: LayoutProps) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
