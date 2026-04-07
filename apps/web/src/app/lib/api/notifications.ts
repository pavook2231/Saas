import { apiRequest } from './fetcher';

type AuthenticatedRequest = {
  accessToken: string;
};

export type NotificationItem = {
  recipientId: string;
  status: 'PENDING' | 'SENT' | 'FAILED' | 'READ';
  deliveredAt: string | null;
  readAt: string | null;
  createdAt: string;
  notification: {
    id: string;
    organizationId: string | null;
    eventId: string | null;
    actorUserId: string | null;
    type: 'EVENT_ASSIGNED' | 'EVENT_UPDATED' | 'EVENT_REMINDER' | 'SYSTEM';
    title: string;
    body: string;
    payload: Record<string, unknown> | null;
    createdAt: string;
  };
};

export type NotificationsListResponse = {
  unreadCount: number;
  items: NotificationItem[];
};

export const notificationsApi = {
  listMyNotifications(
    params: AuthenticatedRequest & {
      limit?: number;
      unreadOnly?: boolean;
    },
  ) {
    return apiRequest<NotificationsListResponse>({
      accessToken: params.accessToken,
      path: '/notifications/me',
      searchParams: {
        limit: params.limit,
        unreadOnly: params.unreadOnly,
      },
    });
  },

  markAsRead(
    params: AuthenticatedRequest & {
      recipientId: string;
    },
  ) {
    return apiRequest<{ success: true; alreadyRead?: true }>({
      accessToken: params.accessToken,
      method: 'PATCH',
      path: `/notifications/me/${params.recipientId}/read`,
    });
  },
};
