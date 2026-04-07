'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { organizationsApi, type OrganizationInvitation } from '@/app/lib/api/organizations';
import { useAuth } from '@/app/providers/auth-provider';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CreateOrganizationAction } from './create-organization-action';
import { PageHeader } from './page-header';
import { useActiveWorkspace } from './use-active-workspace';
import { useToastFeedback } from './use-toast-feedback';
import { roleLabels } from '@/lib/organization-access';

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

export function ProfileWorkspace() {
  const { refreshSession } = useAuth();
  const {
    accessToken,
    user,
    organizations,
    activeOrganizationId,
    setActiveOrganizationId,
    refreshOrganizations,
  } = useActiveWorkspace();

  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [invitations, setInvitations] = useState<OrganizationInvitation[]>([]);
  const [noticeText, setNoticeText] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  useToastFeedback({
    noticeText,
    errorText,
    noticeTitle: 'Профиль',
    errorTitle: 'Профиль',
  });

  const displayName = useMemo(() => {
    const parts = [user?.firstName, user?.lastName].filter(Boolean);
    return parts.join(' ').trim() || user?.email || 'Пользователь';
  }, [user?.email, user?.firstName, user?.lastName]);

  const loadProfileData = useCallback(async () => {
    if (!accessToken) {
      setInvitations([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const inviteResponse = await organizationsApi.listMyInvitations({ accessToken });
      setInvitations(inviteResponse);
      setErrorText(null);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось загрузить профиль.');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadProfileData();
  }, [loadProfileData]);

  const handleAcceptInvitation = async (invitation: OrganizationInvitation) => {
    if (!accessToken) {
      return;
    }

    setProcessingId(invitation.invitationId);
    setNoticeText(null);
    setErrorText(null);

    try {
      await organizationsApi.acceptInvitation({
        accessToken,
        invitationId: invitation.invitationId,
      });
      await refreshSession();
      await refreshOrganizations();
      setActiveOrganizationId(invitation.organization.id);
      await loadProfileData();
      setNoticeText(`Вы вступили в организацию «${invitation.organization.name}».`);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось принять приглашение.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleLeaveOrganization = async (organizationId: string, organizationName: string) => {
    if (!accessToken) {
      return;
    }

    if (!window.confirm(`Выйти из организации «${organizationName}»?`)) {
      return;
    }

    setProcessingId(organizationId);
    setNoticeText(null);
    setErrorText(null);

    try {
      await organizationsApi.leaveOrganization({ accessToken, organizationId });
      await refreshSession();
      await refreshOrganizations();
      await loadProfileData();
      setNoticeText(`Вы вышли из организации «${organizationName}».`);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось выйти из организации.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeleteOrganization = async (organizationId: string, organizationName: string) => {
    if (!accessToken) {
      return;
    }

    if (!window.confirm(`Удалить организацию «${organizationName}»? Это действие необратимо.`)) {
      return;
    }

    setProcessingId(organizationId);
    setNoticeText(null);
    setErrorText(null);

    try {
      await organizationsApi.archiveOrganization({ accessToken, organizationId });
      await refreshSession();
      await refreshOrganizations();
      await loadProfileData();
      setNoticeText(`Организация «${organizationName}» удалена.`);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось удалить организацию.');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <section className="app-page">
      <PageHeader
        eyebrow="Профиль"
        title="Профиль"
        description="Организации, приглашения и ваш доступ."
        actions={<CreateOrganizationAction />}
      />

      {noticeText ? <p className="finance-notice">{noticeText}</p> : null}
      {errorText ? <p className="finance-error">{errorText}</p> : null}

      <div className="profile-layout">
        <div className="profile-column profile-column--main">
          <Card>
            <CardContent className="profile-hero-card">
              <Avatar name={displayName} src={user?.avatarUrl} size="lg" />
              <div className="profile-hero-card__copy">
                <strong>{displayName}</strong>
                <span>{user?.email ?? '—'}</span>
              </div>
              <div className="profile-hero-card__meta">
                <Badge variant="neutral">Организаций: {organizations.length}</Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Приглашения</CardTitle>
              <CardDescription>Вступление в организацию возможно только по приглашению администратора.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="empty-state">Загружаем приглашения...</p>
              ) : invitations.length === 0 ? (
                <div className="resource-empty-inline">
                  <strong>Приглашений нет</strong>
                  <p>Когда администратор пригласит вас, приглашение появится здесь.</p>
                </div>
              ) : (
                <div className="resource-card__list">
                  {invitations.map((invitation) => (
                    <div key={invitation.invitationId} className="profile-item-card">
                      <div className="resource-inline-info">
                        <strong>{invitation.organization.name}</strong>
                        <span>Роль: {roleLabels[invitation.role]}</span>
                        <span>Действует до {formatDateTime(invitation.expiresAt)}</span>
                      </div>
                      <div className="resource-card__actions">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => void handleAcceptInvitation(invitation)}
                          loading={processingId === invitation.invitationId}
                        >
                          Принять приглашение
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="profile-column profile-column--side">
          <Card>
            <CardHeader>
              <CardTitle>Мои организации</CardTitle>
              <CardDescription>Здесь видно, где вы состоите и с какой ролью работаете.</CardDescription>
            </CardHeader>
            <CardContent>
              {organizations.length === 0 ? (
                <div className="resource-empty-inline">
                  <strong>Организаций пока нет</strong>
                  <p>Создайте организацию или примите приглашение.</p>
                </div>
              ) : (
                <div className="resource-card__list">
                  {organizations.map((organization) => (
                    <div key={organization.id} className="profile-item-card">
                      <div className="resource-inline-info">
                        <strong>{organization.name}</strong>
                        <span>{roleLabels[organization.role]} · {organization.slug}</span>
                      </div>
                      <div className="resource-card__actions">
                        {activeOrganizationId === organization.id ? (
                          <Badge variant="primary">Активная</Badge>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setActiveOrganizationId(organization.id)}
                          >
                            Сделать активной
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleLeaveOrganization(organization.id, organization.name)}
                          loading={processingId === organization.id}
                        >
                          Выйти
                        </Button>
                        {organization.role === 'ADMIN' ? (
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            onClick={() => void handleDeleteOrganization(organization.id, organization.name)}
                            loading={processingId === organization.id}
                          >
                            Удалить
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}

