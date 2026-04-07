import { apiRequest } from './fetcher';

export type OrganizationRole = 'ADMIN' | 'DIRECTOR' | 'ASSISTANT' | 'MEMBER';
export type MembershipStatus =
  | 'INVITED'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'LEFT'
  | 'REMOVED';

export type OrganizationSummary = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  timezone: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  financeEnabled: boolean;
  role: OrganizationRole;
  membershipStatus: MembershipStatus;
  acceptedAt?: string | null;
};

export type OrganizationDetails = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  timezone: string | null;
  createdAt: string;
  updatedAt: string;
  financeEnabled: boolean;
  role: OrganizationRole;
  membershipStatus: MembershipStatus;
};

export type OrganizationMember = {
  id: string;
  role: OrganizationRole;
  status: MembershipStatus;
  invitedAt: string | null;
  acceptedAt: string | null;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    avatarUrl?: string | null;
  };
};

export type UpdateOrganizationPayload = {
  name?: string;
  description?: string;
  timezone?: string;
  financeEnabled?: boolean;
};

export type CreateOrganizationPayload = {
  name: string;
  description?: string;
  timezone?: string;
  financeEnabled?: boolean;
};

type AuthenticatedRequest = {
  accessToken: string;
};

export const organizationsApi = {
  createOrganization(
    params: AuthenticatedRequest & {
      payload: CreateOrganizationPayload;
    },
  ) {
    return apiRequest<OrganizationSummary>({
      accessToken: params.accessToken,
      method: 'POST',
      path: '/organizations',
      body: params.payload,
    });
  },

  listMyOrganizations(params: AuthenticatedRequest) {
    return apiRequest<OrganizationSummary[]>({
      accessToken: params.accessToken,
      path: '/organizations',
    });
  },

  getOrganization(
    params: AuthenticatedRequest & {
      organizationId: string;
    },
  ) {
    return apiRequest<OrganizationDetails>({
      accessToken: params.accessToken,
      path: `/organizations/${params.organizationId}`,
    });
  },

  updateOrganization(
    params: AuthenticatedRequest & {
      organizationId: string;
      payload: UpdateOrganizationPayload;
    },
  ) {
    return apiRequest<OrganizationDetails>({
      accessToken: params.accessToken,
      method: 'PATCH',
      path: `/organizations/${params.organizationId}`,
      body: params.payload,
    });
  },

  listMemberships(
    params: AuthenticatedRequest & {
      organizationId: string;
    },
  ) {
    return apiRequest<OrganizationMember[]>({
      accessToken: params.accessToken,
      path: `/organizations/${params.organizationId}/memberships`,
    });
  },
};
