import { apiRequest } from './fetcher';

export type EventType = 'PERFORMANCE' | 'REHEARSAL' | 'EVENT' | 'CUSTOM';
export type EventStatus = 'DRAFT' | 'PLANNED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
export type EventAttendanceStatus =
  | 'INVITED'
  | 'CONFIRMED'
  | 'DECLINED'
  | 'CHECKED_IN'
  | 'CHECKED_OUT';

export type ParticipantRecord = {
  id: string;
  organizationId: string;
  userId: string | null;
  firstName: string;
  lastName: string;
  middleName: string | null;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  invitationStatus: string;
  invitedAt: string | null;
  linkedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type TemplateRoleAssignment = {
  participantId: string;
  participant: ParticipantRecord;
};

export type TemplateRoleRecord = {
  id: string;
  name: string;
  requiredCount: number;
  sortOrder: number;
  description: string | null;
  assignments: TemplateRoleAssignment[];
};

export type TemplateRecord = {
  id: string;
  organizationId: string;
  name: string;
  type: EventType;
  description: string | null;
  location: string | null;
  durationMinutes: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  roles: TemplateRoleRecord[];
};

export type EventTemplateSummary = {
  id: string;
  name: string;
  type: EventType;
  location: string | null;
  durationMinutes: number;
  isActive: boolean;
};

export type EventParticipantRecord = {
  id: string;
  participantId: string;
  templateRoleId: string | null;
  roleName: string | null;
  attendanceStatus: EventAttendanceStatus;
  isRequired: boolean;
  checkInAt: string | null;
  checkOutAt: string | null;
  notes: string | null;
  participant: ParticipantRecord;
  templateRole: {
    id: string;
    name: string;
    sortOrder: number;
  } | null;
};

export type EventRecord = {
  id: string;
  organizationId: string;
  templateId: string | null;
  title: string;
  description: string | null;
  type: EventType;
  status: EventStatus;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  timezone: string | null;
  location: string | null;
  isAllDay: boolean;
  createdAt: string;
  updatedAt: string;
  template: EventTemplateSummary | null;
  participants: EventParticipantRecord[];
};

export type ConflictItem = {
  type: 'EVENT' | 'AVAILABILITY';
  relatedId: string;
  startsAt: string;
  endsAt: string;
  status: string;
  title?: string;
  reason?: string | null;
};

export type ConflictParticipantEntry = {
  participantId: string;
  participantName: string;
  conflicts: ConflictItem[];
};

export type ConflictCheckResult = {
  hasConflicts: boolean;
  conflictsByParticipant: ConflictParticipantEntry[];
  summary: {
    participantsChecked: number;
    conflictedParticipants: number;
    eventConflicts: number;
    availabilityConflicts: number;
  };
  suggestion: string | null;
};

export type CreateParticipantPayload = {
  firstName: string;
  lastName: string;
  middleName?: string;
  displayName?: string;
  email?: string;
  phone?: string;
  notes?: string;
  sendInvite?: boolean;
};

export type UpdateParticipantPayload = {
  firstName?: string;
  lastName?: string;
  middleName?: string;
  displayName?: string;
  email?: string;
  phone?: string;
  notes?: string;
  userId?: string;
  unlinkUser?: boolean;
};

export type CreateTemplatePayload = {
  name: string;
  type?: EventType;
  description?: string;
  location?: string;
  durationMinutes: number;
  isActive?: boolean;
  roles?: Array<{
    name: string;
    requiredCount?: number;
    sortOrder?: number;
    description?: string;
    participantIds?: string[];
  }>;
};

export type CreateEventPayload = {
  title: string;
  description?: string;
  type?: EventType;
  status?: EventStatus;
  startsAt: string;
  endsAt: string;
  timezone?: string;
  location?: string;
  isAllDay?: boolean;
  templateId?: string;
  ignoreConflicts?: boolean;
  participants?: Array<{
    participantId: string;
    templateRoleId?: string;
    roleName?: string;
    attendanceStatus?: EventAttendanceStatus;
    isRequired?: boolean;
    notes?: string;
  }>;
};

export type UpdateEventPayload = {
  title?: string;
  description?: string;
  type?: EventType;
  status?: EventStatus;
  startsAt?: string;
  endsAt?: string;
  timezone?: string;
  location?: string;
  isAllDay?: boolean;
  templateId?: string | null;
  ignoreConflicts?: boolean;
  participants?: Array<{
    participantId: string;
    templateRoleId?: string;
    roleName?: string;
    attendanceStatus?: EventAttendanceStatus;
    isRequired?: boolean;
    notes?: string;
  }>;
};

type OrganizationScopedRequest = {
  accessToken: string;
  organizationId: string;
};

export const operationsApi = {
  listParticipants(
    params: OrganizationScopedRequest & {
      includeDeleted?: boolean;
      limit?: number;
      search?: string;
      signal?: AbortSignal;
    },
  ) {
    return apiRequest<ParticipantRecord[]>({
      accessToken: params.accessToken,
      path: `/organizations/${params.organizationId}/participants`,
      searchParams: {
        search: params.search,
        limit: params.limit,
        includeDeleted: params.includeDeleted,
      },
      signal: params.signal,
    });
  },

  createParticipant(
    params: OrganizationScopedRequest & {
      payload: CreateParticipantPayload;
    },
  ) {
    return apiRequest<ParticipantRecord & { inviteToken?: string | null }>({
      accessToken: params.accessToken,
      method: 'POST',
      path: `/organizations/${params.organizationId}/participants`,
      body: params.payload,
    });
  },

  updateParticipant(
    params: OrganizationScopedRequest & {
      participantId: string;
      payload: UpdateParticipantPayload;
    },
  ) {
    return apiRequest<ParticipantRecord>({
      accessToken: params.accessToken,
      method: 'PATCH',
      path: `/organizations/${params.organizationId}/participants/${params.participantId}`,
      body: params.payload,
    });
  },

  listTemplates(
    params: OrganizationScopedRequest & {
      isActive?: boolean;
      limit?: number;
      type?: EventType;
      signal?: AbortSignal;
    },
  ) {
    return apiRequest<TemplateRecord[]>({
      accessToken: params.accessToken,
      path: `/organizations/${params.organizationId}/templates`,
      searchParams: {
        limit: params.limit,
        type: params.type,
        isActive: params.isActive,
      },
      signal: params.signal,
    });
  },

  createTemplate(
    params: OrganizationScopedRequest & {
      payload: CreateTemplatePayload;
    },
  ) {
    return apiRequest<TemplateRecord>({
      accessToken: params.accessToken,
      method: 'POST',
      path: `/organizations/${params.organizationId}/templates`,
      body: params.payload,
    });
  },

  listEvents(
    params: OrganizationScopedRequest & {
      from?: string;
      limit?: number;
      participantId?: string;
      status?: EventStatus;
      templateId?: string;
      to?: string;
      type?: EventType;
      signal?: AbortSignal;
    },
  ) {
    return apiRequest<EventRecord[]>({
      accessToken: params.accessToken,
      path: `/organizations/${params.organizationId}/events`,
      searchParams: {
        from: params.from,
        to: params.to,
        type: params.type,
        status: params.status,
        participantId: params.participantId,
        templateId: params.templateId,
        limit: params.limit,
      },
      signal: params.signal,
    });
  },

  createEvent(
    params: OrganizationScopedRequest & {
      payload: CreateEventPayload;
    },
  ) {
    return apiRequest<EventRecord>({
      accessToken: params.accessToken,
      method: 'POST',
      path: `/organizations/${params.organizationId}/events`,
      body: params.payload,
    });
  },

  updateEvent(
    params: OrganizationScopedRequest & {
      eventId: string;
      payload: UpdateEventPayload;
    },
  ) {
    return apiRequest<EventRecord>({
      accessToken: params.accessToken,
      method: 'PATCH',
      path: `/organizations/${params.organizationId}/events/${params.eventId}`,
      body: params.payload,
    });
  },

  deleteEvent(
    params: OrganizationScopedRequest & {
      eventId: string;
    },
  ) {
    return apiRequest<{ success: true }>({
      accessToken: params.accessToken,
      method: 'DELETE',
      path: `/organizations/${params.organizationId}/events/${params.eventId}`,
    });
  },

  checkConflicts(
    params: OrganizationScopedRequest & {
      endsAt: string;
      excludeEventId?: string;
      participantIds: string[];
      startsAt: string;
      signal?: AbortSignal;
    },
  ) {
    return apiRequest<ConflictCheckResult>({
      accessToken: params.accessToken,
      method: 'POST',
      path: `/organizations/${params.organizationId}/events/conflicts/check`,
      body: {
        startsAt: params.startsAt,
        endsAt: params.endsAt,
        participantIds: params.participantIds,
        excludeEventId: params.excludeEventId,
      },
      signal: params.signal,
    });
  },
};

export const participantDisplayName = (participant: ParticipantRecord): string => {
  const fullName = [participant.firstName, participant.lastName].filter(Boolean).join(' ').trim();
  return participant.displayName?.trim() || fullName || participant.email || participant.id;
};
