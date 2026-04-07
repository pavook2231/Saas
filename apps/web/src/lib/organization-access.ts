import type { OrganizationRole } from '@/app/lib/api/organizations';

export const MANAGEMENT_ROLES: OrganizationRole[] = ['ADMIN', 'DIRECTOR', 'ASSISTANT'];
export const MEMBER_ROLE: OrganizationRole = 'MEMBER';

export const canAccessControlPanel = (role: OrganizationRole | null | undefined): boolean =>
  Boolean(role && MANAGEMENT_ROLES.includes(role));

export const canManageMembers = (role: OrganizationRole | null | undefined): boolean =>
  role === 'ADMIN' || role === 'DIRECTOR';

export const canManageInvitations = (role: OrganizationRole | null | undefined): boolean =>
  role === 'ADMIN';

export const canManageSchedule = (role: OrganizationRole | null | undefined): boolean =>
  canAccessControlPanel(role);

export const roleLabels: Record<OrganizationRole, string> = {
  ADMIN: 'Админ',
  DIRECTOR: 'Директор',
  ASSISTANT: 'Помреж',
  MEMBER: 'Участник',
};

