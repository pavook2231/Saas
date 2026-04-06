import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from 'crypto';

import { AppConfig } from '../../config/app.config';

type RuntimeConfig = {
  appConfig: AppConfig;
};

const ENCRYPTION_PREFIX = 'enc:v1';
const ENCRYPTION_PARTS = 5;
const GCM_IV_BYTES = 12;

@Injectable()
export class DataEncryptionService {
  private readonly logger = new Logger(DataEncryptionService.name);
  private readonly encryptionKey: Buffer;
  private readonly hmacKey: Buffer;

  constructor(private readonly configService: ConfigService<RuntimeConfig>) {
    const config = this.getConfig();
    this.encryptionKey = this.resolveEncryptionKey(config);
    this.hmacKey = createHash('sha256')
      .update(Buffer.concat([this.encryptionKey, Buffer.from(':hmac', 'utf8')]))
      .digest();
  }

  encrypt(plainText: string, aad?: string): string {
    if (plainText.length === 0) {
      return plainText;
    }

    const iv = randomBytes(GCM_IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);

    if (aad) {
      cipher.setAAD(Buffer.from(aad, 'utf8'));
    }

    const cipherText = Buffer.concat([
      cipher.update(plainText, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return [
      ENCRYPTION_PREFIX,
      iv.toString('base64url'),
      cipherText.toString('base64url'),
      authTag.toString('base64url'),
    ].join(':');
  }

  decrypt(value: string, aad?: string): string {
    if (!this.isEncrypted(value)) {
      return value;
    }

    const parts = value.split(':');

    if (parts.length !== ENCRYPTION_PARTS) {
      throw new InternalServerErrorException('Encrypted payload format is invalid');
    }

    const iv = Buffer.from(parts[2], 'base64url');
    const cipherText = Buffer.from(parts[3], 'base64url');
    const authTag = Buffer.from(parts[4], 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, iv);

    if (aad) {
      decipher.setAAD(Buffer.from(aad, 'utf8'));
    }

    decipher.setAuthTag(authTag);

    try {
      return Buffer.concat([decipher.update(cipherText), decipher.final()]).toString('utf8');
    } catch {
      throw new InternalServerErrorException('Encrypted payload could not be decrypted');
    }
  }

  hashDeterministic(value: string): string {
    return createHmac('sha256', this.hmacKey).update(value).digest('hex');
  }

  isEncrypted(value: string | null | undefined): value is string {
    return typeof value === 'string' && value.startsWith(`${ENCRYPTION_PREFIX}:`);
  }

  maskValue(value: string, visibleTail = 8): string {
    if (value.length <= visibleTail) {
      return '*'.repeat(Math.max(4, value.length));
    }

    return `${'*'.repeat(Math.max(6, value.length - visibleTail))}${value.slice(-visibleTail)}`;
  }

  private resolveEncryptionKey(config: AppConfig): Buffer {
    const source = config.security.dataEncryptionKey.trim();

    if (source.length === 0) {
      throw new InternalServerErrorException('DATA_ENCRYPTION_KEY is required');
    }

    let key: Buffer;

    if (/^[0-9a-f]{64}$/i.test(source)) {
      key = Buffer.from(source, 'hex');
    } else {
      try {
        const decoded = Buffer.from(source, 'base64');
        key = decoded.length === 32 ? decoded : createHash('sha256').update(source).digest();
      } catch {
        key = createHash('sha256').update(source).digest();
      }
    }

    if (key.length !== 32) {
      key = createHash('sha256').update(key).digest();
    }

    if (
      config.app.nodeEnv === 'production' &&
      source === 'development-only-encryption-key-change-me'
    ) {
      this.logger.error('Refusing to boot with the default data encryption key');
      throw new InternalServerErrorException('DATA_ENCRYPTION_KEY must be rotated');
    }

    return key;
  }

  private getConfig(): AppConfig {
    const config = this.configService.get<AppConfig>('appConfig');

    if (!config) {
      throw new InternalServerErrorException('Application config is missing');
    }

    return config;
  }
}
