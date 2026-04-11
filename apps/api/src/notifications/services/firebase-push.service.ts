import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type PushSendResult = {
  token: string;
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
};

@Injectable()
export class FirebasePushService {
  private readonly logger = new Logger(FirebasePushService.name);
  private readonly enabled: boolean;

  constructor(private readonly configService: ConfigService) {
    const configEnabled =
      configService.get<boolean>('appConfig.firebase.enabled') ?? false;

    this.enabled = false;

    if (configEnabled) {
      this.logger.warn(
        'Firebase push delivery is disabled in this build while the firebase-admin dependency chain remains isolated.',
      );
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async sendToTokens(input: {
    tokens: string[];
    title: string;
    body: string;
    data?: Record<string, string>;
  }): Promise<PushSendResult[]> {
    return Array.from(new Set(input.tokens.filter(Boolean))).map((token) => ({
      token,
      success: false,
      errorCode: 'firebase-push-disabled',
      errorMessage: 'Firebase push delivery is disabled in this build',
    }));
  }
}
