'use client';

import { useState } from 'react';

import { authApi } from '@/app/lib/auth/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type CalendarSyncSettingsProps = {
  accessToken: string | null;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
};

export function CalendarSyncSettings({
  accessToken,
  onNotice,
  onError,
}: CalendarSyncSettingsProps) {
  const [loading, setLoading] = useState(false);

  const handleSync = async () => {
    if (!accessToken) {
      onError('Нужна активная сессия.');
      return;
    }

    setLoading(true);

    try {
      const links = await authApi.getCalendarSyncLinks(accessToken);

      if (typeof window !== 'undefined') {
        window.location.href = links.webcalUrl;
      }

      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(links.httpsUrl);
        onNotice('Ссылка на календарь скопирована. Если телефон не открыл календарь сам, вставьте её в подписку календаря вручную.');
      } else {
        onNotice('Подписка на календарь подготовлена. Если календарь не открылся автоматически, используйте HTTPS-ссылку из поддержки браузера.');
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Не удалось подготовить синхронизацию календаря.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="account-browser-push">
      <div className="account-browser-push__header">
        <div className="account-browser-push__switch is-enabled" aria-hidden="true">
          <span className="account-browser-push__bell is-enabled">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path
                d="M6 4.75h12a1.25 1.25 0 0 1 1.25 1.25v12A1.25 1.25 0 0 1 18 19.25H6A1.25 1.25 0 0 1 4.75 18V6A1.25 1.25 0 0 1 6 4.75Z"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.8"
              />
              <path
                d="M8 3.75v2M16 3.75v2M7.5 9.25h9M8 12.5h3M8 15.5h5"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.8"
              />
            </svg>
          </span>
          <span className="account-browser-push__switch-copy">
            <strong>Календарь телефона</strong>
            <small>Подписка на все ваши события из системы</small>
          </span>
        </div>
        <Badge variant="primary">iPhone и Android</Badge>
      </div>

      <div className="account-browser-push__meta">
        <span>Кнопка создаст персональную ссылку календаря и попробует открыть её как подписку.</span>
        <span>В календаре телефона будут появляться все ваши события, где вы назначены участником.</span>
      </div>

      <div className="account-browser-push__actions">
        <Button type="button" onClick={() => void handleSync()} loading={loading} disabled={!accessToken}>
          Синхронизировать с календарем телефона
        </Button>
      </div>
    </div>
  );
}
