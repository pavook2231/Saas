'use client';

import type { Route } from 'next';
import { usePathname, useRouter } from 'next/navigation';
import { type PropsWithChildren, useEffect } from 'react';

import { useAuth } from '../providers/auth-provider';

export function AuthGuard({ children }: PropsWithChildren) {
  const router = useRouter();
  const pathname = usePathname();
  const { status } = useAuth();

  useEffect(() => {
    if (status === 'unauthenticated') {
      const params = new URLSearchParams();
      params.set('next', pathname || '/dashboard');
      router.replace(`/auth?${params.toString()}` as Route);
    }
  }, [pathname, router, status]);

  if (status !== 'authenticated') {
    return (
      <div className="auth-check-screen">
        <div className="auth-check-card">
          <div className="auth-check-mark" />
          <p>Проверяем сессию и подготавливаем рабочее пространство...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
