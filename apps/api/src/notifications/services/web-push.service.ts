import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import webpush from 'web-push';

import { AppConfig } from '../../config/app.config';

type RuntimeConfig = {
  appConfig: AppConfig;
};

export type WebPushSubscriptionPayload = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type WebPushSendResult = {
  endpoint: string;
  success: boolean;
  statusCode?: number;
  errorCode?: string;
  errorMessage?: string;
};

@Injectable()
export class WebPushService {
  private readonly logger = new Logger(WebPushService.name);
  private readonly enabled: boolean;

  constructor(private readonly configService: ConfigService<RuntimeConfig>) {
    const config = this.configService.get<AppConfig>('appConfig');

    if (!config?.notifications.webPush.enabled) {
      this.enabled = false;
      return;
    }

    try {
      webpush.setVapidDetails(
        config.notifications.webPush.subject,
        config.notifications.webPush.publicKey,
        config.notifications.webPush.privateKey,
      );
      this.enabled = true;
    } catch (error) {
      this.enabled = false;
      this.logger.error('Failed to initialize web push', error as Error);
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async sendToSubscriptions(input: {
    subscriptions: WebPushSubscriptionPayload[];
    title: string;
    body: string;
    data?: Record<string, string>;
  }): Promise<WebPushSendResult[]> {
    const uniqueSubscriptions = Array.from(
      new Map(
        input.subscriptions
          .filter((item) => item.endpoint && item.p256dh && item.auth)
          .map((item) => [item.endpoint, item]),
      ).values(),
    );

    if (uniqueSubscriptions.length === 0) {
      return [];
    }

    if (!this.enabled) {
      return uniqueSubscriptions.map((subscription) => ({
        endpoint: subscription.endpoint,
        success: false,
        errorCode: 'web-push-not-configured',
        errorMessage: 'Web push is not configured',
      }));
    }

    const payload = JSON.stringify({
      title: input.title,
      body: input.body,
      data: input.data ?? {},
    });

    const results = await Promise.all(
      uniqueSubscriptions.map(async (subscription) => {
        try {
          const result = await webpush.sendNotification(
            this.toSubscription(subscription),
            payload,
            {
              TTL: 60,
              urgency: 'high',
            },
          );

          return {
            endpoint: subscription.endpoint,
            success: true,
            statusCode: result.statusCode,
          } satisfies WebPushSendResult;
        } catch (error) {
          const pushError = error as {
            statusCode?: number;
            body?: string;
            message?: string;
          };

          return {
            endpoint: subscription.endpoint,
            success: false,
            statusCode: pushError.statusCode,
            errorCode: this.toErrorCode(pushError.statusCode),
            errorMessage: pushError.body || pushError.message || 'Web push failed',
          } satisfies WebPushSendResult;
        }
      }),
    );

    return results;
  }

  private toSubscription(input: WebPushSubscriptionPayload) {
    return {
      endpoint: input.endpoint,
      expirationTime: null,
      keys: {
        p256dh: input.p256dh,
        auth: input.auth,
      },
    };
  }

  private toErrorCode(statusCode?: number): string | undefined {
    if (!statusCode) {
      return undefined;
    }

    if (statusCode === 404 || statusCode === 410) {
      return 'web-push-subscription-gone';
    }

    if (statusCode === 401 || statusCode === 403) {
      return 'web-push-auth-failed';
    }

    return `web-push-${statusCode}`;
  }
}
