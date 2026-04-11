'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { notificationsApi } from '@/app/lib/api/notifications';
import { Badge } from '@/components/ui/badge';

type EventReminderSettingsProps = {
  accessToken: string | null;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
};

const ReminderIcon = ({ enabled }: { enabled: boolean }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      d="M12 6.5a5.5 5.5 0 1 0 5.5 5.5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    />
    <path
      d="M12 2.75v1.5M19.25 5.75l-1.1 1.1M4.75 5.75l1.1 1.1"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    />
    <path
      d="M12 9.25v3.5l2 1.25"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    />
    <path
      d="M7.5 18.5h9"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    />
    {!enabled ? (
      <path
        d="M5 5 19 19"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    ) : null}
  </svg>
);

export function EventReminderSettings({
  accessToken,
  onNotice,
  onError,
}: EventReminderSettingsProps) {
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  const loadPreference = useCallback(async () => {
    if (!accessToken) {
      setReady(false);
      return;
    }

    try {
      const response = await notificationsApi.getReminderPreferences({ accessToken });
      setEnabled(response.enabled);
      setReady(true);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Не удалось загрузить настройки напоминаний.');
    }
  }, [accessToken, onError]);

  useEffect(() => {
    void loadPreference();
  }, [loadPreference]);

  const handleToggle = async (nextValue: boolean) => {
    if (!accessToken) {
      onError('Нужна активная сессия.');
      return;
    }

    setLoading(true);

    try {
      const response = await notificationsApi.updateReminderPreferences({
        accessToken,
        enabled: nextValue,
      });
      setEnabled(response.enabled);
      onNotice(
        response.enabled
          ? 'Напоминания о событиях включены.'
          : 'Напоминания о событиях выключены.',
      );
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Не удалось обновить напоминания.');
    } finally {
      setLoading(false);
    }
  };

  const stateLabel = useMemo(
    () =>
      enabled
        ? 'За день до события в 20:00 придёт напоминание, если вы в составе.'
        : 'Напоминания не отправляются, даже если вы назначены в событие.',
    [enabled],
  );

  return (
    <div className="account-browser-push">
      <div className="account-browser-push__header">
        <button
          type="button"
          className={`account-browser-push__switch ${enabled ? 'is-enabled' : 'is-disabled'}`}
          onClick={() => void handleToggle(!enabled)}
          disabled={loading || !accessToken || !ready}
          role="switch"
          aria-checked={enabled}
          aria-label={enabled ? 'Выключить напоминания о событиях' : 'Включить напоминания о событиях'}
        >
          <span className={`account-browser-push__bell ${enabled ? 'is-enabled' : 'is-disabled'}`}>
            <ReminderIcon enabled={enabled} />
          </span>
          <span className="account-browser-push__switch-copy">
            <strong>{enabled ? 'Напоминания включены' : 'Напоминания выключены'}</strong>
            <small>{loading ? 'Сохраняем...' : 'За день до события в 20:00'}</small>
          </span>
        </button>
        <Badge variant={enabled ? 'success' : 'neutral'}>{stateLabel}</Badge>
      </div>
    </div>
  );
}
