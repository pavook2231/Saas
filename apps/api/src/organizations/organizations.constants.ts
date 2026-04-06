import { OrganizationRole } from '@prisma/client';

export const ORG_ROLE_METADATA_KEY = 'org_roles';

export const ALL_ORG_ROLES: OrganizationRole[] = [
  OrganizationRole.ADMIN,
  OrganizationRole.DIRECTOR,
  OrganizationRole.ASSISTANT,
  OrganizationRole.MEMBER,
];
