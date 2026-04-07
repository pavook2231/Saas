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
  inviteCode?: string;
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
  inviteCode?: string;
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

export type OrganizationInvitation = {
  invitationId: string;
  membershipId: string;
  role: OrganizationRole;
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
  invitedAt: string;
  expiresAt: string;
  organization: OrganizationSummary;
};

export type OrganizationOutgoingInvitation = {
  invitationId: string;
  email: string;
  role: OrganizationRole;
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
  invitedAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  invitedBy: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
  acceptedBy: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
};

export type OrganizationJoinRequestStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

export type OrganizationJoinRequestRecord = {
  requestId: string;
  status: OrganizationJoinRequestStatus;
  message: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  organization: OrganizationSummary;
};

export type OrganizationJoinRequestAdminRecord = OrganizationJoinRequestRecord & {
  requester: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
  reviewedBy: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
};

export type DiscoverOrganizationRecord = OrganizationSummary & {
  joinLink?: string;
  joinRequestStatus: OrganizationJoinRequestStatus | null;
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

export type CreateJoinRequestPayload = {
  message?: string;
};

export type InviteOrganizationMemberPayload = {
  email: string;
  role?: OrganizationRole;
};

export type ReviewJoinRequestPayload = {
  status: Extract<OrganizationJoinRequestStatus, 'APPROVED' | 'REJECTED'>;
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

  listMyInvitations(params: AuthenticatedRequest) {
    return apiRequest<OrganizationInvitation[]>({
      accessToken: params.accessToken,
      path: '/organizations/invitations/me',
    });
  },

  acceptInvitation(
    params: AuthenticatedRequest & {
      invitationId: string;
    },
  ) {
    return apiRequest<{ id: string; role: OrganizationRole; status: MembershipStatus }>({
      accessToken: params.accessToken,
      method: 'POST',
      path: `/organizations/invitations/${params.invitationId}/accept`,
    });
  },

  listMyJoinRequests(params: AuthenticatedRequest) {
    return apiRequest<OrganizationJoinRequestRecord[]>({
      accessToken: params.accessToken,
      path: '/organizations/join-requests/me',
    });
  },

  discoverOrganizations(
    params: AuthenticatedRequest & {
      search?: string;
      limit?: number;
    },
  ) {
    return apiRequest<DiscoverOrganizationRecord[]>({
      accessToken: params.accessToken,
      path: '/organizations/discover',
      searchParams: {
        search: params.search,
        limit: params.limit,
      },
    });
  },

  createJoinRequest(
    params: AuthenticatedRequest & {
      organizationId: string;
      payload?: CreateJoinRequestPayload;
    },
  ) {
    return apiRequest<OrganizationJoinRequestRecord>({
      accessToken: params.accessToken,
      method: 'POST',
      path: `/organizations/${params.organizationId}/join-requests`,
      body: params.payload ?? {},
    });
  },

  listOrganizationJoinRequests(
    params: AuthenticatedRequest & {
      organizationId: string;
    },
  ) {
    return apiRequest<OrganizationJoinRequestAdminRecord[]>({
      accessToken: params.accessToken,
      path: `/organizations/${params.organizationId}/join-requests`,
    });
  },

  reviewJoinRequest(
    params: AuthenticatedRequest & {
      organizationId: string;
      requestId: string;
      payload: ReviewJoinRequestPayload;
    },
  ) {
    return apiRequest<OrganizationJoinRequestAdminRecord>({
      accessToken: params.accessToken,
      method: 'PATCH',
      path: `/organizations/${params.organizationId}/join-requests/${params.requestId}`,
      body: params.payload,
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

  listOrganizationInvitations(
    params: AuthenticatedRequest & {
      organizationId: string;
    },
  ) {
    return apiRequest<OrganizationOutgoingInvitation[]>({
      accessToken: params.accessToken,
      path: `/organizations/${params.organizationId}/invitations`,
    });
  },

  inviteOrganizationMember(
    params: AuthenticatedRequest & {
      organizationId: string;
      payload: InviteOrganizationMemberPayload;
    },
  ) {
    return apiRequest<
      OrganizationOutgoingInvitation & {
        inviteToken: string;
        inviteLink: string;
      }
    >({
      accessToken: params.accessToken,
      method: 'POST',
      path: `/organizations/${params.organizationId}/invite`,
      body: params.payload,
    });
  },

  revokeOrganizationInvitation(
    params: AuthenticatedRequest & {
      organizationId: string;
      invitationId: string;
    },
  ) {
    return apiRequest<{ success: true; status: 'REVOKED' | 'EXPIRED' }>({
      accessToken: params.accessToken,
      method: 'POST',
      path: `/organizations/${params.organizationId}/invitations/${params.invitationId}/revoke`,
    });
  },

  leaveOrganization(
    params: AuthenticatedRequest & {
      organizationId: string;
    },
  ) {
    return apiRequest<{ success: true }>({
      accessToken: params.accessToken,
      method: 'POST',
      path: `/organizations/${params.organizationId}/memberships/leave`,
    });
  },
};
