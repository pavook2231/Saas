import { Suspense } from 'react';

import AuthPageClient from './auth-page-client';

export default function AuthPage() {
  return (
    <Suspense
      fallback={
        <main className="auth-check-screen">
          <div className="auth-check-card">
            <div className="auth-check-mark" />
            <p>Подготавливаем экран входа...</p>
          </div>
        </main>
      }
    >
      <AuthPageClient />
    </Suspense>
  );
}
