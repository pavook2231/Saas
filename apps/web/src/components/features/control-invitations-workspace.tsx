'use client';

import { useCallback, useEffect, useState } from 'react';

import { organizationsApi, type OrganizationOutgoingInvitation, type OrganizationRole } from '@/app/lib/api/organizations';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { canManageInvitations, roleLabels } from '@/lib/organization-access';

import { ManagementShell } from './management-shell';
import { useActiveWorkspace } from './use-active-workspace';
import { useToastFeedback } from './use-toast-feedback';

const formatDateTime = (value: string | null | undefined) => {
  if (!value) {
    return '—';
  }

  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
};

const invitationStatusLabel: Record<string, string> = {
  PENDING: 'Активно',
  ACCEPTED: 'Принято',
  REVOKED: 'Отозвано',
  EXPIRED: 'Истекло',
};

export function ControlInvitationsWorkspace() {
  const { accessToken, activeOrganizationId, activeRole } = useActiveWorkspace();
  const [invitations, setInvitations] = useState<OrganizationOutgoingInvitation[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<OrganizationRole>('MEMBER');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [latestInviteLink, setLatestInviteLink] = useState<string | null>(null);
  const [noticeText, setNoticeText] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const canInvite = canManageInvitations(activeRole);

  useToastFeedback({
    noticeText,
    errorText,
    noticeTitle: 'Приглашения',
    errorTitle: 'Приглашения',
  });

  const loadInvitations = useCallback(async () => {
    if (!accessToken || !activeOrganizationId) {
      setInvitations([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const response = await organizationsApi.listOrganizationInvitations({
        accessToken,
        organizationId: activeOrganizationId,
      });
      setInvitations(response);
      setErrorText(null);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось загрузить приглашения.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, activeOrganizationId]);

  useEffect(() => {
    void loadInvitations();
  }, [loadInvitations]);

  const handleSendInvitation = async () => {
    if (!accessToken || !activeOrganizationId) {
      return;
    }

    setSending(true);
    setNoticeText(null);
    setErrorText(null);

    try {
      const response = await organizationsApi.inviteOrganizationMember({
        accessToken,
        organizationId: activeOrganizationId,
        payload: {
          email: inviteEmail.trim().toLowerCase(),
          role: inviteRole,
        },
      });

      setInvitations((current) => [response, ...current.filter((item) => item.invitationId !== response.invitationId)]);
      setLatestInviteLink(response.inviteLink);
      setInviteEmail('');
      setInviteRole('MEMBER');
      setNoticeText(`Приглашение для ${response.email} подготовлено.`);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось отправить приглашение.');
    } finally {
      setSending(false);
    }
  };

  const handleCopyInviteLink = async (inviteLink: string) => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setNoticeText('Ссылка приглашения скопирована.');
    } catch {
      setErrorText('Не удалось скопировать ссылку.');
    }
  };

  const handleRevokeInvitation = async (invitation: OrganizationOutgoingInvitation) => {
    if (!accessToken || !activeOrganizationId) {
      return;
    }

    setProcessingId(invitation.invitationId);
    setNoticeText(null);
    setErrorText(null);

    try {
      const response = await organizationsApi.revokeOrganizationInvitation({
        accessToken,
        organizationId: activeOrganizationId,
        invitationId: invitation.invitationId,
      });
      setInvitations((current) =>
        current.map((item) =>
          item.invitationId === invitation.invitationId
            ? { ...item, status: response.status, revokedAt: new Date().toISOString() }
            : item,
        ),
      );
      setNoticeText(`Приглашение для ${invitation.email} отозвано.`);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось отозвать приглашение.');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <ManagementShell title="Пригласить в организацию" description="Только админ может приглашать новых пользователей.">
      {noticeText ? <p className="finance-notice">{noticeText}</p> : null}
      {errorText ? <p className="finance-error">{errorText}</p> : null}

      {!canInvite ? (
        <Card>
          <CardContent className="resource-empty-inline">
            <strong>Недостаточно прав</strong>
            <p>Приглашать в организацию может только админ.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Новое приглашение</CardTitle>
              <CardDescription>Введите email и роль. После этого можно сразу скопировать ссылку.</CardDescription>
            </CardHeader>
            <CardContent className="profile-stack">
              <div className="settings-invite-form">
                <Input
                  label="Email"
                  type="email"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder="user@example.com"
                />
                <Select
                  label="Роль"
                  value={inviteRole}
                  onChange={(event) => setInviteRole(event.target.value as OrganizationRole)}
                >
                  <option value="MEMBER">{roleLabels.MEMBER}</option>
                  <option value="ASSISTANT">{roleLabels.ASSISTANT}</option>
                  <option value="DIRECTOR">{roleLabels.DIRECTOR}</option>
                  <option value="ADMIN">{roleLabels.ADMIN}</option>
                </Select>
                <Button type="button" onClick={() => void handleSendInvitation()} loading={sending}>
                  Пригласить
                </Button>
              </div>

              {latestInviteLink ? (
                <div className="settings-invite-link">
                  <div className="resource-inline-info">
                    <strong>Последняя ссылка</strong>
                    <span className="truncate">{latestInviteLink}</span>
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => void handleCopyInviteLink(latestInviteLink)}>
                    Копировать
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Отправленные приглашения</CardTitle>
              <CardDescription>Список активных и завершенных приглашений.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="empty-state">Загружаем приглашения...</p>
              ) : invitations.length === 0 ? (
                <div className="resource-empty-inline">
                  <strong>Приглашений пока нет</strong>
                  <p>Первое приглашение появится здесь сразу после отправки.</p>
                </div>
              ) : (
                <div className="resource-card__list">
                  {invitations.map((invitation) => (
                    <div key={invitation.invitationId} className="profile-item-card">
                      <div className="resource-inline-info">
                        <strong>{invitation.email}</strong>
                        <span>Роль: {roleLabels[invitation.role]}</span>
                        <span>
                          {invitation.status === 'ACCEPTED'
                            ? `Принято ${formatDateTime(invitation.acceptedAt)}`
                            : `Действует до ${formatDateTime(invitation.expiresAt)}`}
                        </span>
                      </div>
                      <div className="resource-card__actions">
                        <Badge variant={invitation.status === 'ACCEPTED' ? 'success' : invitation.status === 'PENDING' ? 'warning' : 'neutral'}>
                          {invitationStatusLabel[invitation.status] ?? invitation.status}
                        </Badge>
                        {invitation.status === 'PENDING' ? (
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            onClick={() => void handleRevokeInvitation(invitation)}
                            loading={processingId === invitation.invitationId}
                          >
                            Отозвать
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </ManagementShell>
  );
}

