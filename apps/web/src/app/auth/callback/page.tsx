import { Suspense } from 'react';

import OAuthCallbackClient from './oauth-callback-client';

export default function OAuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="auth-check-screen">
          <div className="auth-check-card callback">
            <div className="auth-check-mark" />
            <h1>Завершаем вход</h1>
            <p>Подтягиваем OAuth-сессию и открываем рабочее пространство...</p>
          </div>
        </main>
      }
    >
      <OAuthCallbackClient />
    </Suspense>
  );
}
