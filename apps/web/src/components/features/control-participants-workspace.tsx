'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  organizationsApi,
  type OrganizationMember,
  type OrganizationOutgoingInvitation,
  type OrganizationRole,
} from '@/app/lib/api/organizations';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { canManageInvitations, canManageMembers, roleLabels } from '@/lib/organization-access';

import { ManagementShell } from './management-shell';
import { useActiveWorkspace } from './use-active-workspace';
import { useMobileViewport } from './use-mobile-viewport';
import { useToastFeedback } from './use-toast-feedback';

const displayMemberName = (member: OrganizationMember) => {
  const fullName = [member.user.firstName, member.user.lastName].filter(Boolean).join(' ').trim();
  return fullName || member.user.email;
};

const roleOptionsByManager: Record<string, OrganizationRole[]> = {
  ADMIN: ['ADMIN', 'DIRECTOR', 'ASSISTANT', 'MEMBER'],
  DIRECTOR: ['DIRECTOR', 'ASSISTANT', 'MEMBER'],
};

const invitationStatusLabel: Record<string, string> = {
  PENDING: 'Активно',
  ACCEPTED: 'Принято',
  REVOKED: 'Отозвано',
  EXPIRED: 'Истекло',
};

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return '—';
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
};

export function ControlParticipantsWorkspace() {
  const { accessToken, activeOrganizationId, activeRole } = useActiveWorkspace();
  const isMobileViewport = useMobileViewport();
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [invitations, setInvitations] = useState<OrganizationOutgoingInvitation[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<OrganizationRole>('MEMBER');
  const [latestInviteLink, setLatestInviteLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState('');
  const [noticeText, setNoticeText] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const canEditMembers = canManageMembers(activeRole);
  const canInvite = canManageInvitations(activeRole);

  useToastFeedback({
    noticeText,
    errorText,
    noticeTitle: 'Участники',
    errorTitle: 'Участники',
  });

  const loadData = useCallback(async () => {
    if (!accessToken || !activeOrganizationId) {
      setMembers([]);
      setInvitations([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const [membersResponse, invitationsResponse] = await Promise.all([
        organizationsApi.listMemberships({ accessToken, organizationId: activeOrganizationId }),
        canInvite
          ? organizationsApi.listOrganizationInvitations({ accessToken, organizationId: activeOrganizationId })
          : Promise.resolve([]),
      ]);
      setMembers(membersResponse);
      setInvitations(invitationsResponse);
      setErrorText(null);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось загрузить участников.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, activeOrganizationId, canInvite]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const roleOptions = useMemo<OrganizationRole[]>(() => roleOptionsByManager[activeRole ?? ''] ?? ['MEMBER'], [activeRole]);

  const filteredMembers = useMemo(() => {
    const query = memberSearch.trim().toLowerCase();
    if (!query) return members;
    return members.filter((member) => {
      const name = displayMemberName(member).toLowerCase();
      return name.includes(query) || member.user.email.toLowerCase().includes(query);
    });
  }, [memberSearch, members]);

  const handleRoleChange = async (member: OrganizationMember, role: OrganizationRole) => {
    if (!accessToken || !activeOrganizationId) return;
    setProcessingId(member.id);
    setNoticeText(null);
    setErrorText(null);

    try {
      const updated = await organizationsApi.updateMembership({
        accessToken,
        organizationId: activeOrganizationId,
        membershipId: member.id,
        payload: { role },
      });
      setMembers((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setNoticeText(`Роль пользователя ${displayMemberName(member)} обновлена.`);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось обновить роль.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleRemoveMember = async (member: OrganizationMember) => {
    if (!accessToken || !activeOrganizationId) return;
    if (!window.confirm(`Удалить пользователя ${displayMemberName(member)} из организации?`)) return;

    setProcessingId(member.id);
    setNoticeText(null);
    setErrorText(null);

    try {
      await organizationsApi.removeMembership({ accessToken, organizationId: activeOrganizationId, membershipId: member.id });
      setMembers((current) => current.filter((item) => item.id !== member.id));
      setNoticeText(`Пользователь ${displayMemberName(member)} удален из организации.`);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось удалить пользователя.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleSendInvitation = async () => {
    if (!accessToken || !activeOrganizationId || !canInvite) return;

    setSending(true);
    setNoticeText(null);
    setErrorText(null);

    try {
      const response = await organizationsApi.inviteOrganizationMember({
        accessToken,
        organizationId: activeOrganizationId,
        payload: { email: inviteEmail.trim().toLowerCase(), role: inviteRole },
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
    if (!accessToken || !activeOrganizationId) return;
    setProcessingId(invitation.invitationId);
    setNoticeText(null);
    setErrorText(null);

    try {
      const response = await organizationsApi.revokeOrganizationInvitation({
        accessToken,
        organizationId: activeOrganizationId,
        invitationId: invitation.invitationId,
      });
      setInvitations((current) => current.map((item) => item.invitationId === invitation.invitationId ? { ...item, status: response.status, revokedAt: new Date().toISOString() } : item));
      setNoticeText(`Приглашение для ${invitation.email} отозвано.`);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось отозвать приглашение.');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <ManagementShell title="Участники" description="Состав организации, роли и приглашение новых людей.">
      {noticeText ? <p className="finance-notice">{noticeText}</p> : null}
      {errorText ? <p className="finance-error">{errorText}</p> : null}

      <div className="page-grid page-grid--two participants-layout">
        <Card className="participants-members-card">
          <CardHeader>
            <CardTitle>Состав организации</CardTitle>
            <CardDescription>Меняйте роли, ищите участников и удаляйте лишних без лишних экранов.</CardDescription>
          </CardHeader>
          <CardContent className="profile-stack">
            <Input label="Поиск по участникам" value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Имя или email" />

            {loading ? (
              <p className="empty-state">Загружаем состав организации...</p>
            ) : filteredMembers.length === 0 ? (
              <div className="resource-empty-inline">
                <strong>Участников не найдено</strong>
                <p>Измените поиск или пригласите нового человека справа.</p>
              </div>
            ) : isMobileViewport ? (
              <div className="participants-mobile-list">
                {filteredMembers.map((member) => (
                  <article key={member.id} className="participants-mobile-card">
                    <div className="participants-mobile-card__head">
                      <div className="participants-mobile-card__identity">
                        <strong>{displayMemberName(member)}</strong>
                        <span>{member.user.email}</span>
                      </div>
                      <Badge variant={member.status === 'ACTIVE' ? 'success' : 'neutral'}>
                        {member.status === 'ACTIVE' ? 'Активен' : member.status}
                      </Badge>
                    </div>

                    <div className="participants-mobile-card__body">
                      <div className="participants-mobile-card__row">
                        <span>Роль</span>
                        {canEditMembers ? (
                          <Select
                            aria-label={`Роль ${displayMemberName(member)}`}
                            value={member.role}
                            onChange={(event) =>
                              void handleRoleChange(member, event.target.value as OrganizationRole)
                            }
                            disabled={processingId === member.id}
                          >
                            {roleOptions.map((role) => (
                              <option key={role} value={role}>
                                {roleLabels[role]}
                              </option>
                            ))}
                          </Select>
                        ) : (
                          <Badge variant="neutral">{roleLabels[member.role]}</Badge>
                        )}
                      </div>

                      <div className="participants-mobile-card__actions">
                        {canEditMembers ? (
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            onClick={() => void handleRemoveMember(member)}
                            loading={processingId === member.id}
                          >
                            Удалить
                          </Button>
                        ) : (
                          <span className="table-muted-copy">Только просмотр</span>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Участник</th>
                      <th>Email</th>
                      <th>Роль</th>
                      <th>Статус</th>
                      <th>Действие</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMembers.map((member) => (
                      <tr key={member.id}>
                        <td><strong>{displayMemberName(member)}</strong></td>
                        <td>{member.user.email}</td>
                        <td>
                          {canEditMembers ? (
                            <Select aria-label={`Роль ${displayMemberName(member)}`} value={member.role} onChange={(event) => void handleRoleChange(member, event.target.value as OrganizationRole)} disabled={processingId === member.id}>
                              {roleOptions.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
                            </Select>
                          ) : (
                            <Badge variant="neutral">{roleLabels[member.role]}</Badge>
                          )}
                        </td>
                        <td><Badge variant={member.status === 'ACTIVE' ? 'success' : 'neutral'}>{member.status === 'ACTIVE' ? 'Активен' : member.status}</Badge></td>
                        <td>
                          {canEditMembers ? (
                            <Button type="button" variant="danger" size="sm" onClick={() => void handleRemoveMember(member)} loading={processingId === member.id}>
                              Удалить
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

        <div className="profile-stack participants-side-column">
          <Card>
            <CardHeader>
              <CardTitle>Пригласить в организацию</CardTitle>
              <CardDescription>Новые участники приглашаются отсюда. Отдельная вкладка больше не нужна.</CardDescription>
            </CardHeader>
            <CardContent className="profile-stack">
              {!canInvite ? (
                <div className="resource-empty-inline">
                  <strong>Недостаточно прав</strong>
                  <p>Приглашать в организацию может только админ.</p>
                </div>
              ) : (
                <>
                  <div className="settings-invite-form">
                    <Input label="Email" type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="user@example.com" />
                    <Select label="Роль" value={inviteRole} onChange={(event) => setInviteRole(event.target.value as OrganizationRole)}>
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
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Отправленные приглашения</CardTitle>
              <CardDescription>Все активные и завершенные приглашения по участникам.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="empty-state">Загружаем приглашения...</p>
              ) : invitations.length === 0 ? (
                <div className="resource-empty-inline">
                  <strong>Приглашений пока нет</strong>
                  <p>После отправки приглашение появится здесь.</p>
                </div>
              ) : (
                <div className="resource-card__list">
                  {invitations.map((invitation) => (
                    <div key={invitation.invitationId} className="profile-item-card">
                      <div className="resource-inline-info">
                        <strong>{invitation.email}</strong>
                        <span>Роль: {roleLabels[invitation.role]}</span>
                        <span>{invitation.status === 'ACCEPTED' ? `Принято ${formatDateTime(invitation.acceptedAt)}` : `Действует до ${formatDateTime(invitation.expiresAt)}`}</span>
                      </div>
                      <div className="resource-card__actions">
                        <Badge variant={invitation.status === 'ACCEPTED' ? 'success' : invitation.status === 'PENDING' ? 'warning' : 'neutral'}>
                          {invitationStatusLabel[invitation.status] ?? invitation.status}
                        </Badge>
                        {invitation.status === 'PENDING' ? (
                          <Button type="button" variant="danger" size="sm" onClick={() => void handleRevokeInvitation(invitation)} loading={processingId === invitation.invitationId}>
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
        </div>
      </div>
    </ManagementShell>
  );
}

