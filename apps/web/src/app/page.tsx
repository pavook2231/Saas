'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { useAuth } from './providers/auth-provider';

export default function HomePage() {
  const router = useRouter();
  const { status } = useAuth();

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace('/dashboard');
      return;
    }

    if (status === 'unauthenticated') {
      router.replace('/auth');
    }
  }, [router, status]);

  return (
    <div className="auth-check-screen">
      <div className="auth-check-card">
        <div className="auth-check-mark" />
        <p>Открываем приложение и проверяем авторизацию...</p>
      </div>
    </div>
  );
}
