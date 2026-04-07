'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  organizationsApi,
  type OrganizationMember,
} from '@/app/lib/api/organizations';
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
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

import { MetricCard } from './metric-card';
import { PageHeader } from './page-header';
import { useActiveWorkspace } from './use-active-workspace';
import { useToastFeedback } from './use-toast-feedback';
import { WorkspaceOrgEmpty } from './workspace-org-empty';

type ParticipantFormState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  notes: string;
  sendInvite: boolean;
};

const invitationLabels: Record<string, string> = {
  PENDING: 'Ожидает',
  ACCEPTED: 'Принято',
  NONE: 'Не отправлялось',
};

const initialFormState: ParticipantFormState = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  notes: '',
  sendInvite: false,
};

const membershipDisplayName = (membership: OrganizationMember): string => {
  const fullName = [membership.user.firstName, membership.user.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();

  return fullName || membership.user.email;
};

export function ParticipantsWorkspace() {
  const { accessToken, activeOrganizationId, activeRole } = useActiveWorkspace();
  const [participants, setParticipants] = useState<ParticipantRecord[]>([]);
  const [memberships, setMemberships] = useState<OrganizationMember[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [linking, setLinking] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [noticeText, setNoticeText] = useState<string | null>(null);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [linkingParticipantId, setLinkingParticipantId] = useState<string | null>(null);
  const [form, setForm] = useState<ParticipantFormState>(initialFormState);
  const canManageParticipants =
    activeRole === 'ADMIN' || activeRole === 'DIRECTOR' || activeRole === 'ASSISTANT';

  useToastFeedback({
    noticeText,
    errorText,
    noticeTitle: 'Участники',
    errorTitle: 'Участники',
  });

  const resetForm = () => {
    setForm(initialFormState);
    setShowAdvanced(false);
  };

  const loadParticipants = useCallback(
    async (query: string, signal?: AbortSignal) => {
      if (!accessToken || !activeOrganizationId) {
        setParticipants([]);
        setMemberships([]);
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const [participantsResponse, membershipsResponse] = await Promise.all([
          operationsApi.listParticipants({
            organizationId: activeOrganizationId,
            accessToken,
            limit: 200,
            search: query.trim() || undefined,
            signal,
          }),
          organizationsApi.listMemberships({
            organizationId: activeOrganizationId,
            accessToken,
          }),
        ]);

        setParticipants(participantsResponse);
        setMemberships(membershipsResponse);
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

  const membershipsByUserId = useMemo(
    () => new Map(memberships.map((membership) => [membership.user.id, membership])),
    [memberships],
  );

  const participantRows = useMemo(() => {
    return participants.map((participant) => {
      const linkedMember = participant.userId ? membershipsByUserId.get(participant.userId) ?? null : null;

      return {
        ...participant,
        linkedMember,
        displayLabel: participantDisplayName(participant),
        kindLabel: participant.userId ? 'Аккаунт' : 'Без аккаунта',
        contact: participant.email || participant.phone || 'Контакт не указан',
        invitationLabel: invitationLabels[participant.invitationStatus] ?? participant.invitationStatus,
      };
    });
  }, [membershipsByUserId, participants]);

  const linkingParticipant = useMemo(
    () => participants.find((participant) => participant.id === linkingParticipantId) ?? null,
    [linkingParticipantId, participants],
  );

  const linkableMembers = useMemo(() => {
    const occupiedUserIds = new Set(
      participants
        .filter(
          (participant) => participant.userId && participant.id !== linkingParticipantId,
        )
        .map((participant) => participant.userId as string),
    );

    return memberships
      .filter(
        (membership) =>
          !occupiedUserIds.has(membership.user.id) || membership.user.id === linkingParticipant?.userId,
      )
      .sort((left, right) =>
        membershipDisplayName(left).localeCompare(membershipDisplayName(right), 'ru'),
      );
  }, [linkingParticipant?.userId, linkingParticipantId, memberships, participants]);

  const openLinkModal = (participant: ParticipantRecord) => {
    setLinkingParticipantId(participant.id);
    setSelectedUserId(participant.userId ?? '');
    setLinkModalOpen(true);
  };

  const closeLinkModal = () => {
    setLinkModalOpen(false);
    setLinkingParticipantId(null);
    setSelectedUserId('');
  };

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
      resetForm();
      setModalOpen(false);
      await loadParticipants(search);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось создать участника');
    } finally {
      setCreating(false);
    }
  };

  const handleLinkParticipant = async () => {
    if (!accessToken || !activeOrganizationId || !linkingParticipantId) {
      return;
    }

    if (!selectedUserId) {
      setErrorText('Сначала выберите человека с аккаунтом');
      return;
    }

    setLinking(true);
    setErrorText(null);
    setNoticeText(null);

    try {
      await operationsApi.updateParticipant({
        organizationId: activeOrganizationId,
        accessToken,
        participantId: linkingParticipantId,
        payload: {
          userId: selectedUserId,
        },
      });

      setNoticeText('Участник связан с аккаунтом. При необходимости связь можно заменить позже.');
      closeLinkModal();
      await loadParticipants(search);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось связать участника с аккаунтом');
    } finally {
      setLinking(false);
    }
  };

  const handleUnlinkParticipant = async () => {
    if (!accessToken || !activeOrganizationId || !linkingParticipantId) {
      return;
    }

    setLinking(true);
    setErrorText(null);
    setNoticeText(null);

    try {
      await operationsApi.updateParticipant({
        organizationId: activeOrganizationId,
        accessToken,
        participantId: linkingParticipantId,
        payload: {
          unlinkUser: true,
        },
      });

      setNoticeText('Связь с аккаунтом убрана. Теперь можно выбрать другого человека.');
      closeLinkModal();
      await loadParticipants(search);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось убрать связь с аккаунтом');
    } finally {
      setLinking(false);
    }
  };

  if (!activeOrganizationId) {
    return (
      <section className="app-page">
        <PageHeader
          eyebrow="Участники"
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
        eyebrow="Участники"
        title="Состав организации"
        description="Если человек сначала был добавлен без аккаунта, теперь его можно в любой момент привязать или заменить на реального пользователя системы."
        actions={
          <div className="feature-page-header__action-row">
            <Input
              className="resource-search"
              placeholder="Поиск по имени, email или телефону"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {canManageParticipants ? (
              <Button
                type="button"
                onClick={() => {
                  resetForm();
                  setModalOpen(true);
                }}
              >
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
          meta="Полный список активных участников"
        />
        <MetricCard
          label="Связаны с аккаунтом"
          value={String(linkedCount)}
          meta="Уже могут входить в систему сами"
        />
        <MetricCard
          label="Приглашения в ожидании"
          value={String(invitedCount)}
          meta="Еще не завершили регистрацию"
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
          Создавать, приглашать и связывать участников могут только ADMIN, DIRECTOR и ASSISTANT.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Список участников</CardTitle>
          <CardDescription>
            Здесь видно, кто уже связан с аккаунтом, а кого еще нужно заменить или привязать к реальному пользователю.
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
              <p>Создайте первого участника, чтобы использовать его в спектаклях и в расписании.</p>
            </div>
          ) : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Участник</th>
                    <th>Тип</th>
                    <th>Контакт</th>
                    <th>Аккаунт</th>
                    <th>Приглашение</th>
                    <th>Действие</th>
                  </tr>
                </thead>
                <tbody>
                  {participantRows.map((participant) => (
                    <tr key={participant.id}>
                      <td>
                        <div className="table-user-cell__copy">
                          <strong>{participant.displayLabel}</strong>
                          <span>{participant.notes?.trim() || 'Без дополнительной заметки'}</span>
                        </div>
                      </td>
                      <td>
                        <Badge variant={participant.userId ? 'success' : 'neutral'}>
                          {participant.kindLabel}
                        </Badge>
                      </td>
                      <td>{participant.contact}</td>
                      <td>
                        {participant.linkedMember ? (
                          <div className="table-user-cell__copy">
                            <strong>{membershipDisplayName(participant.linkedMember)}</strong>
                            <span>{participant.linkedMember.user.email}</span>
                          </div>
                        ) : (
                          <span className="table-muted-copy">Пока не привязан</span>
                        )}
                      </td>
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
                          {participant.invitationLabel}
                        </Badge>
                      </td>
                      <td>
                        {canManageParticipants ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => openLinkModal(participant)}
                          >
                            {participant.userId ? 'Заменить аккаунт' : 'Привязать аккаунт'}
                          </Button>
                        ) : (
                          <span className="table-muted-copy">Только просмотр</span>
                        )}
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
        description="Сначала только имя и фамилия. Контакты и приглашение можно добавить при необходимости."
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>
              Отмена
            </Button>
            <Button type="button" onClick={() => void handleCreateParticipant()} loading={creating}>
              Сохранить участника
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

          <button
            type="button"
            className="form-advanced-toggle"
            onClick={() => setShowAdvanced((current) => !current)}
          >
            {showAdvanced ? 'Скрыть дополнительные поля' : 'Контакты и приглашение'}
          </button>

          {showAdvanced ? (
            <div className="resource-form-grid">
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
                  placeholder="Например: основная труппа, приглашенный артист или техническая команда"
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
          ) : null}
        </div>
      </Modal>

      <Modal
        open={linkModalOpen}
        onClose={closeLinkModal}
        title={linkingParticipant?.userId ? 'Заменить аккаунт участника' : 'Привязать аккаунт'}
        description={
          linkingParticipant
            ? `Участник: ${participantDisplayName(linkingParticipant)}. Выберите человека с аккаунтом из этой организации.`
            : 'Выберите человека с аккаунтом.'
        }
        footer={
          <>
            {linkingParticipant?.userId ? (
              <Button type="button" variant="danger" onClick={() => void handleUnlinkParticipant()} loading={linking}>
                Убрать связь
              </Button>
            ) : null}
            <Button type="button" variant="ghost" onClick={closeLinkModal}>
              Отмена
            </Button>
            <Button type="button" onClick={() => void handleLinkParticipant()} loading={linking}>
              Сохранить связь
            </Button>
          </>
        }
      >
        <div className="resource-form-grid">
          <Select
            label="Человек с аккаунтом"
            value={selectedUserId}
            onChange={(event) => setSelectedUserId(event.target.value)}
            hint="Показываем только свободные аккаунты этой организации и текущую связь, если она уже была."
          >
            <option value="">Выберите пользователя</option>
            {linkableMembers.map((membership) => (
              <option key={membership.user.id} value={membership.user.id}>
                {membershipDisplayName(membership)} · {membership.role}
              </option>
            ))}
          </Select>

          {linkableMembers.length === 0 ? (
            <div className="resource-empty-inline">
              <strong>Нет доступных аккаунтов</strong>
              <p>Сначала добавьте человека в организацию с реальным аккаунтом, затем вернитесь сюда.</p>
            </div>
          ) : null}
        </div>
      </Modal>
    </section>
  );
}

