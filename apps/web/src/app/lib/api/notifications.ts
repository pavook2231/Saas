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

export type WebPushSubscriptionItem = {
  id: string;
  endpointFingerprint: string;
  userAgent: string | null;
  deviceLabel: string | null;
  isActive: boolean;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
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

  listWebPushSubscriptions(params: AuthenticatedRequest) {
    return apiRequest<WebPushSubscriptionItem[]>({
      accessToken: params.accessToken,
      path: '/notifications/push/web',
    });
  },

  registerWebPushSubscription(
    params: AuthenticatedRequest & {
      endpoint: string;
      userAgent?: string;
      deviceLabel?: string;
      keys: {
        p256dh: string;
        auth: string;
      };
    },
  ) {
    return apiRequest<{
      id: string;
      endpointFingerprint: string;
      userAgent: string | null;
      deviceLabel: string | null;
      isActive: boolean;
      lastSeenAt: string | null;
      createdAt: string;
      updatedAt: string;
    }>({
      accessToken: params.accessToken,
      method: 'POST',
      path: '/notifications/push/web/subscribe',
      body: {
        endpoint: params.endpoint,
        userAgent: params.userAgent,
        deviceLabel: params.deviceLabel,
        keys: params.keys,
      },
    });
  },

  unregisterWebPushSubscription(
    params: AuthenticatedRequest & {
      endpoint: string;
    },
  ) {
    return apiRequest<{ success: true; disabledCount: number }>({
      accessToken: params.accessToken,
      method: 'POST',
      path: '/notifications/push/web/unsubscribe',
      body: {
        endpoint: params.endpoint,
      },
    });
  },
};
