import { SetMetadata } from '@nestjs/common';
import { OrganizationRole } from '@prisma/client';

import { ORG_ROLE_METADATA_KEY } from '../organizations.constants';

export const RequireOrgRoles = (...roles: OrganizationRole[]) =>
  SetMetadata(ORG_ROLE_METADATA_KEY, roles);
