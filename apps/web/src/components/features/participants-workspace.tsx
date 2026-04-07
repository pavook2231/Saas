'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  operationsApi,
  participantDisplayName,
  type ParticipantRecord,
} from '@/app/lib/api/operations';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Skeleton } from '@/components/ui/skeleton';

import { MetricCard } from './metric-card';
import { PageHeader } from './page-header';
import { useActiveWorkspace } from './use-active-workspace';
import { WorkspaceOrgEmpty } from './workspace-org-empty';

type ParticipantFormState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  notes: string;
  sendInvite: boolean;
};

const initialFormState: ParticipantFormState = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  notes: '',
  sendInvite: false,
};

export function ParticipantsWorkspace() {
  const { accessToken, activeOrganizationId, activeRole } = useActiveWorkspace();
  const [participants, setParticipants] = useState<ParticipantRecord[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [noticeText, setNoticeText] = useState<string | null>(null);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<ParticipantFormState>(initialFormState);
  const canManageParticipants =
    activeRole === 'ADMIN' || activeRole === 'DIRECTOR' || activeRole === 'ASSISTANT';

  const loadParticipants = useCallback(
    async (query: string, signal?: AbortSignal) => {
      if (!accessToken || !activeOrganizationId) {
        setParticipants([]);
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const data = await operationsApi.listParticipants({
          organizationId: activeOrganizationId,
          accessToken,
          limit: 200,
          search: query.trim() || undefined,
          signal,
        });

        setParticipants(data);
        setErrorText(null);
      } catch (error) {
        if (signal?.aborted) {
          return;
        }

        setErrorText(error instanceof Error ? error.message : 'Не удалось загрузить участников');
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [accessToken, activeOrganizationId],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void loadParticipants(search, controller.signal);
    }, 220);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [loadParticipants, search]);

  const linkedCount = useMemo(
    () => participants.filter((participant) => Boolean(participant.userId)).length,
    [participants],
  );

  const invitedCount = useMemo(
    () => participants.filter((participant) => participant.invitationStatus === 'PENDING').length,
    [participants],
  );

  const participantRows = useMemo(() => {
    return participants.map((participant) => ({
      ...participant,
      displayLabel: participantDisplayName(participant),
      kindLabel: participant.userId ? 'Аккаунт' : 'Participant',
      contact: participant.email || participant.phone || 'Контакт не указан',
    }));
  }, [participants]);

  const handleCreateParticipant = async () => {
    if (!accessToken || !activeOrganizationId) {
      return;
    }

    setCreating(true);
    setErrorText(null);
    setNoticeText(null);
    setInviteToken(null);

    try {
      if (form.firstName.trim().length < 1 || form.lastName.trim().length < 1) {
        throw new Error('Укажите имя и фамилию участника');
      }

      if (form.sendInvite && form.email.trim().length === 0) {
        throw new Error('Для отправки приглашения нужен email');
      }

      const created = await operationsApi.createParticipant({
        organizationId: activeOrganizationId,
        accessToken,
        payload: {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.trim() || undefined,
          phone: form.phone.trim() || undefined,
          notes: form.notes.trim() || undefined,
          sendInvite: form.sendInvite,
        },
      });

      setNoticeText(
        created.inviteToken
          ? 'Участник создан, приглашение подготовлено.'
          : 'Участник создан.',
      );
      setInviteToken(created.inviteToken ?? null);
      setForm(initialFormState);
      setModalOpen(false);
      await loadParticipants(search);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось создать участника');
    } finally {
      setCreating(false);
    }
  };

  if (!activeOrganizationId) {
    return (
      <section className="app-page">
        <PageHeader
          eyebrow="Participants"
          title="Участники организации"
          description="Экран готов к работе, но сначала нужен активный membership в организации."
        />
        <WorkspaceOrgEmpty />
      </section>
    );
  }

  return (
    <section className="app-page">
      <PageHeader
        eyebrow="Participants"
        title="Участники организации"
        description="Поиск, статус приглашения и создание участника собраны в одном рабочем экране без лишней сложности."
        actions={
          <div className="feature-page-header__action-row">
            <Input
              className="resource-search"
              placeholder="Поиск по имени, email или телефону"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {canManageParticipants ? (
              <Button type="button" onClick={() => setModalOpen(true)}>
              Добавить участника
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="page-grid page-grid--three">
        <MetricCard
          label="Всего участников"
          value={String(participants.length)}
          meta="Полный список активных участников организации"
        />
        <MetricCard
          label="Связаны с аккаунтом"
          value={String(linkedCount)}
          meta="Участники, у которых уже есть пользовательский профиль"
        />
        <MetricCard
          label="Приглашения в ожидании"
          value={String(invitedCount)}
          meta="Участники, которым уже подготовлен invite"
        />
      </div>

      {noticeText ? (
        <p className="finance-notice">
          {noticeText}
          {inviteToken ? ` Токен приглашения: ${inviteToken}` : ''}
        </p>
      ) : null}

      {errorText ? <p className="finance-error">{errorText}</p> : null}
      {!canManageParticipants ? (
        <p className="empty-state">
          Создавать и приглашать участников могут только ADMIN, DIRECTOR и ASSISTANT.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Список участников</CardTitle>
          <CardDescription>
            Зарегистрированные пользователи и participants без аккаунта отображаются единообразно.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="resource-skeleton-grid">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="resource-skeleton-card" />
              ))}
            </div>
          ) : participantRows.length === 0 ? (
            <div className="resource-empty-inline">
              <strong>Пока нет участников</strong>
              <p>Создайте первого участника, чтобы использовать его в спектаклях и событиях.</p>
            </div>
          ) : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Участник</th>
                    <th>Тип</th>
                    <th>Контакт</th>
                    <th>Статус приглашения</th>
                  </tr>
                </thead>
                <tbody>
                  {participantRows.map((participant) => (
                    <tr key={participant.id}>
                      <td>
                        <div className="table-user-cell">
                          <div className="table-user-cell__copy">
                            <strong>{participant.displayLabel}</strong>
                            <span>{participant.id.slice(0, 8)}...</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <Badge variant={participant.userId ? 'success' : 'neutral'}>
                          {participant.kindLabel}
                        </Badge>
                      </td>
                      <td>{participant.contact}</td>
                      <td>
                        <Badge
                          variant={
                            participant.invitationStatus === 'PENDING'
                              ? 'warning'
                              : participant.invitationStatus === 'ACCEPTED'
                                ? 'success'
                                : 'neutral'
                          }
                        >
                          {participant.invitationStatus}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Новый участник"
        description="Добавьте человека в организацию. При необходимости сразу подготовим приглашение."
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>
              Отмена
            </Button>
            <Button type="button" onClick={() => void handleCreateParticipant()} loading={creating}>
              Создать участника
            </Button>
          </>
        }
      >
        <div className="resource-form-grid">
          <div className="resource-form-grid resource-form-grid--double">
            <Input
              label="Имя"
              value={form.firstName}
              onChange={(event) => setForm((current) => ({ ...current, firstName: event.target.value }))}
            />
            <Input
              label="Фамилия"
              value={form.lastName}
              onChange={(event) => setForm((current) => ({ ...current, lastName: event.target.value }))}
            />
          </div>

          <div className="resource-form-grid resource-form-grid--double">
            <Input
              label="Email"
              type="email"
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            />
            <Input
              label="Телефон"
              value={form.phone}
              onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
            />
          </div>

          <label className="ui-field-group">
            <span className="ui-field-group__label">Заметка</span>
            <textarea
              className="ui-field"
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              placeholder="Например: основная труппа, приглашенный артист, сценическая команда"
            />
          </label>

          <label className="checkbox-row">
            <input
              checked={form.sendInvite}
              type="checkbox"
              onChange={(event) =>
                setForm((current) => ({ ...current, sendInvite: event.target.checked }))
              }
            />
            <span>Сразу подготовить приглашение по email</span>
          </label>
        </div>
      </Modal>
    </section>
  );
}
