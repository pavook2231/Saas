import type { PropsWithChildren } from 'react';

import { AppShell } from '@/components/layout/app-shell';

import { AuthGuard } from '../components/auth-guard';

export default function WorkspaceLayout({ children }: PropsWithChildren) {
  return (
    <AuthGuard>
      <AppShell>{children}</AppShell>
    </AuthGuard>
  );
}
