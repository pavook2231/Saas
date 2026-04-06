import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { App, cert, getApps, initializeApp } from 'firebase-admin/app';
import { Messaging, getMessaging } from 'firebase-admin/messaging';

export type PushSendResult = {
  token: string;
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
};

@Injectable()
export class FirebasePushService {
  private readonly logger = new Logger(FirebasePushService.name);
  private readonly messaging: Messaging | null;

  constructor(private readonly configService: ConfigService) {
    const enabled = configService.get<boolean>('appConfig.firebase.enabled') ?? false;

    if (!enabled) {
      this.messaging = null;
      return;
    }

    const projectId = configService.get<string>('appConfig.firebase.projectId') ?? '';
    const clientEmail = configService.get<string>('appConfig.firebase.clientEmail') ?? '';
    const privateKeyRaw = configService.get<string>('appConfig.firebase.privateKey') ?? '';
    const privateKey = privateKeyRaw.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      this.logger.warn('Firebase is enabled but credentials are incomplete');
      this.messaging = null;
      return;
    }

    const appName = 'saas-platform-api-firebase';
    let app: App;

    const existing = getApps().find((item) => item.name === appName);

    if (existing) {
      app = existing;
    } else {
      app = initializeApp(
        {
          credential: cert({
            projectId,
            clientEmail,
            privateKey,
          }),
        },
        appName,
      );
    }

    this.messaging = getMessaging(app);
  }

  isEnabled(): boolean {
    return this.messaging !== null;
  }

  async sendToTokens(input: {
    tokens: string[];
    title: string;
    body: string;
    data?: Record<string, string>;
  }): Promise<PushSendResult[]> {
    const uniqueTokens = Array.from(new Set(input.tokens.filter(Boolean)));

    if (uniqueTokens.length === 0) {
      return [];
    }

    if (!this.messaging) {
      return uniqueTokens.map((token) => ({
        token,
        success: false,
        errorCode: 'firebase-not-configured',
        errorMessage: 'Firebase is not configured',
      }));
    }

    const chunks = this.chunk(uniqueTokens, 500);
    const results: PushSendResult[] = [];

    for (const chunk of chunks) {
      const response = await this.messaging.sendEachForMulticast({
        tokens: chunk,
        notification: {
          title: input.title,
          body: input.body,
        },
        data: input.data,
      });

      response.responses.forEach((item, index) => {
        const token = chunk[index];

        if (item.success) {
          results.push({
            token,
            success: true,
          });

          return;
        }

        results.push({
          token,
          success: false,
          errorCode: item.error?.code,
          errorMessage: item.error?.message,
        });
      });
    }

    return results;
  }

  private chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];

    for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size));
    }

    return chunks;
  }
}
