import { apiRequest } from './fetcher';

export type EventType = 'PERFORMANCE' | 'REHEARSAL' | 'TOUR' | 'EVENT' | 'CUSTOM';
export type EventStatus = 'DRAFT' | 'PLANNED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
export type EventAttendanceStatus =
  | 'INVITED'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'ATTENDED'
  | 'ABSENT';

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

export type EventChecklistItemRecord = {
  id: string;
  label: string;
  category: string | null;
  notes: string | null;
  sortOrder: number;
  isCompleted: boolean;
  completedAt: string | null;
  completedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
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
  assemblyAt: string | null;
  durationMinutes: number;
  timezone: string | null;
  location: string | null;
  performanceCastNumber: 1 | 2 | null;
  performanceCastLocked: boolean;
  isAllDay: boolean;
  createdAt: string;
  updatedAt: string;
  template: EventTemplateSummary | null;
  participants: EventParticipantRecord[];
  checklistItems: EventChecklistItemRecord[];
};

export type PublishWeekScheduleResult = {
  publishedEvents: EventRecord[];
  publishedCount: number;
  weekStart: string;
  weekEnd: string;
  notified: boolean;
};

export type SendEventReminderResult = {
  success: true;
  sentCount: number;
};

export type EventHistoryRecord = {
  id: string;
  action: string;
  description: string | null;
  payload: unknown;
  createdAt: string;
  actor: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
  } | null;
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
  suggestion:
    | {
        recommendedStartsAt: string;
        recommendedEndsAt: string;
      }
    | null;
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

export type UpdateTemplatePayload = {
  name?: string;
  type?: EventType;
  description?: string;
  location?: string;
  durationMinutes?: number;
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
  assemblyAt?: string;
  timezone?: string;
  location?: string;
  isAllDay?: boolean;
  templateId?: string;
  performanceCastNumber?: 1 | 2;
  useAutomaticPerformanceCast?: boolean;
  ignoreConflicts?: boolean;
  participants?: Array<{
    participantId: string;
    templateRoleId?: string;
    roleName?: string;
    attendanceStatus?: EventAttendanceStatus;
    isRequired?: boolean;
    notes?: string;
  }>;
  checklistItems?: Array<{
    label: string;
    category?: string;
    notes?: string;
    sortOrder?: number;
    isCompleted?: boolean;
  }>;
};

export type UpdateEventPayload = {
  title?: string;
  description?: string;
  type?: EventType;
  status?: EventStatus;
  startsAt?: string;
  endsAt?: string;
  assemblyAt?: string | null;
  timezone?: string;
  location?: string;
  isAllDay?: boolean;
  templateId?: string | null;
  performanceCastNumber?: 1 | 2 | null;
  useAutomaticPerformanceCast?: boolean;
  ignoreConflicts?: boolean;
  participants?: Array<{
    participantId: string;
    templateRoleId?: string;
    roleName?: string;
    attendanceStatus?: EventAttendanceStatus;
    isRequired?: boolean;
    notes?: string;
  }>;
  checklistItems?: Array<{
    label: string;
    category?: string;
    notes?: string;
    sortOrder?: number;
    isCompleted?: boolean;
  }>;
};

type OrganizationScopedRequest = {
  accessToken: string;
  organizationId: string;
};

const normalizeLimit = (limit?: number) => {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) {
    return undefined;
  }

  return Math.min(Math.max(Math.trunc(limit), 1), 500);
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
        limit: normalizeLimit(params.limit),
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
        limit: normalizeLimit(params.limit),
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

  updateTemplate(
    params: OrganizationScopedRequest & {
      templateId: string;
      payload: UpdateTemplatePayload;
    },
  ) {
    return apiRequest<TemplateRecord>({
      accessToken: params.accessToken,
      method: 'PATCH',
      path: `/organizations/${params.organizationId}/templates/${params.templateId}`,
      body: params.payload,
    });
  },

  archiveTemplate(
    params: OrganizationScopedRequest & {
      templateId: string;
    },
  ) {
    return apiRequest<{ success: true; alreadyDeleted?: true }>({
      accessToken: params.accessToken,
      method: 'DELETE',
      path: `/organizations/${params.organizationId}/templates/${params.templateId}`,
    });
  },

  listEvents(
    params: OrganizationScopedRequest & {
      from?: string;
      includeDrafts?: boolean;
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
        includeDrafts: params.includeDrafts,
        participantId: params.participantId,
        templateId: params.templateId,
        limit: normalizeLimit(params.limit),
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

  publishWeekSchedule(
    params: OrganizationScopedRequest & {
      anchorDate: string;
    },
  ) {
    return apiRequest<PublishWeekScheduleResult>({
      accessToken: params.accessToken,
      method: 'POST',
      path: `/organizations/${params.organizationId}/events/week/publish`,
      body: {
        anchorDate: params.anchorDate,
      },
    });
  },

  sendEventReminder(
    params: OrganizationScopedRequest & {
      eventId: string;
    },
  ) {
    return apiRequest<SendEventReminderResult>({
      accessToken: params.accessToken,
      method: 'POST',
      path: `/organizations/${params.organizationId}/events/${params.eventId}/remind`,
    });
  },

  listEventHistory(
    params: OrganizationScopedRequest & {
      eventId: string;
    },
  ) {
    return apiRequest<EventHistoryRecord[]>({
      accessToken: params.accessToken,
      path: `/organizations/${params.organizationId}/events/${params.eventId}/history`,
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
  const surnameFirst = [participant.lastName, participant.firstName, participant.middleName]
    .filter(Boolean)
    .join(' ')
    .trim();
  const fullName = [participant.firstName, participant.lastName, participant.middleName]
    .filter(Boolean)
    .join(' ')
    .trim();

  return surnameFirst || fullName || participant.displayName?.trim() || participant.email || participant.id;
};
