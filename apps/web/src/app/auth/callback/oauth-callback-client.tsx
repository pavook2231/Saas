'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { useAuth } from '../../providers/auth-provider';

export default function OAuthCallbackClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { completeOAuthLogin, status } = useAuth();
  const [errorText, setErrorText] = useState<string | null>(null);

  const nextUrl = useMemo(() => {
    const raw = searchParams.get('next');
    return (raw && raw.startsWith('/') ? raw : '/calendar') as Route;
  }, [searchParams]);

  const csrfToken = searchParams.get('csrfToken') ?? undefined;

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace(nextUrl);
      return;
    }

    let cancelled = false;

    const finish = async () => {
      try {
        await completeOAuthLogin(csrfToken);

        if (!cancelled) {
          router.replace(nextUrl);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorText(
            error instanceof Error ? error.message : 'Не удалось завершить OAuth вход',
          );
        }
      }
    };

    void finish();

    return () => {
      cancelled = true;
    };
  }, [completeOAuthLogin, csrfToken, nextUrl, router, status]);

  return (
    <main className="auth-check-screen">
      <div className="auth-check-card callback">
        <div className="auth-check-mark" />
        <h1>Завершаем вход</h1>
        <p>
          {errorText
            ? errorText
            : 'Проверяем OAuth-сессию и перенаправляем вас в рабочее пространство.'}
        </p>

        {errorText ? (
          <Link href="/auth" className="workspace-primary-link">
            Вернуться ко входу
          </Link>
        ) : null}
      </div>
    </main>
  );
}
