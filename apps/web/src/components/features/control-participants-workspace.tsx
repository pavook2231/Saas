'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { organizationsApi, type OrganizationMember, type OrganizationRole } from '@/app/lib/api/organizations';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { canManageMembers, roleLabels } from '@/lib/organization-access';

import { ManagementShell } from './management-shell';
import { useActiveWorkspace } from './use-active-workspace';
import { useToastFeedback } from './use-toast-feedback';

const displayMemberName = (member: OrganizationMember) => {
  const fullName = [member.user.firstName, member.user.lastName].filter(Boolean).join(' ').trim();
  return fullName || member.user.email;
};

const roleOptionsByManager: Record<string, OrganizationRole[]> = {
  ADMIN: ['ADMIN', 'DIRECTOR', 'ASSISTANT', 'MEMBER'],
  DIRECTOR: ['DIRECTOR', 'ASSISTANT', 'MEMBER'],
};

export function ControlParticipantsWorkspace() {
  const { accessToken, activeOrganizationId, activeRole } = useActiveWorkspace();
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [noticeText, setNoticeText] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const canEditMembers = canManageMembers(activeRole);

  useToastFeedback({
    noticeText,
    errorText,
    noticeTitle: 'Участники',
    errorTitle: 'Участники',
  });

  const loadMembers = useCallback(async () => {
    if (!accessToken || !activeOrganizationId) {
      setMembers([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const response = await organizationsApi.listMemberships({
        accessToken,
        organizationId: activeOrganizationId,
      });
      setMembers(response);
      setErrorText(null);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось загрузить участников.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, activeOrganizationId]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  const roleOptions = useMemo<OrganizationRole[]>(
    () => roleOptionsByManager[activeRole ?? ''] ?? ['MEMBER'],
    [activeRole],
  );

  const handleRoleChange = async (member: OrganizationMember, role: OrganizationRole) => {
    if (!accessToken || !activeOrganizationId) {
      return;
    }

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
    if (!accessToken || !activeOrganizationId) {
      return;
    }

    if (!window.confirm(`Удалить пользователя ${displayMemberName(member)} из организации?`)) {
      return;
    }

    setProcessingId(member.id);
    setNoticeText(null);
    setErrorText(null);

    try {
      await organizationsApi.removeMembership({
        accessToken,
        organizationId: activeOrganizationId,
        membershipId: member.id,
      });
      setMembers((current) => current.filter((item) => item.id !== member.id));
      setNoticeText(`Пользователь ${displayMemberName(member)} удален из организации.`);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось удалить пользователя.');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <ManagementShell title="Участники" description="Список людей в организации, роли и доступ.">
      {noticeText ? <p className="finance-notice">{noticeText}</p> : null}
      {errorText ? <p className="finance-error">{errorText}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>Состав организации</CardTitle>
          <CardDescription>Меняйте роли и удаляйте людей без лишних экранов.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="empty-state">Загружаем состав организации...</p>
          ) : members.length === 0 ? (
            <div className="resource-empty-inline">
              <strong>Участников пока нет</strong>
              <p>После приглашения люди появятся в этом списке.</p>
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
                  {members.map((member) => (
                    <tr key={member.id}>
                      <td>
                        <strong>{displayMemberName(member)}</strong>
                      </td>
                      <td>{member.user.email}</td>
                      <td>
                        {canEditMembers ? (
                          <Select
                            aria-label={`Роль ${displayMemberName(member)}`}
                            value={member.role}
                            onChange={(event) => void handleRoleChange(member, event.target.value as OrganizationRole)}
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
                      </td>
                      <td>
                        <Badge variant={member.status === 'ACTIVE' ? 'success' : 'neutral'}>
                          {member.status === 'ACTIVE' ? 'Активен' : member.status}
                        </Badge>
                      </td>
                      <td>
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
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </ManagementShell>
  );
}

