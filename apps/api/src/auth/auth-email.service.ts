import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailAuthCodePurpose } from '@prisma/client';
import nodemailer, { type Transporter } from 'nodemailer';

import { AppConfig } from '../config/app.config';

import { EmailCodeMessageContext } from './auth.types';

type RuntimeConfig = {
  appConfig: AppConfig;
};

@Injectable()
export class AuthEmailService {
  private readonly logger = new Logger(AuthEmailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly configService: ConfigService<RuntimeConfig>) {}

  async sendEmailCode(context: EmailCodeMessageContext): Promise<void> {
    const config = this.getConfig().mail.smtp;

    if (!config.enabled) {
      throw new ServiceUnavailableException(
        'Отправка кодов по почте еще не настроена на сервере.',
      );
    }

    const transporter = this.getTransporter();
    const copy = this.resolveCopy(context);

    try {
      await transporter.sendMail({
        from: config.from,
        to: context.email,
        subject: copy.subject,
        text: copy.text,
        html: copy.html,
      });
    } catch (error) {
      this.logger.error(
        `Failed to send email auth code to ${this.maskEmail(context.email)}: ${(error as Error).message}`,
      );
      throw new ServiceUnavailableException(
        'Не удалось отправить письмо с кодом. Попробуйте еще раз.',
      );
    }
  }

  private resolveCopy(context: EmailCodeMessageContext): {
    subject: string;
    text: string;
    html: string;
  } {
    const appName = 'Внутренний сервис театра';

    const purposeCopy: Record<
      EmailAuthCodePurpose,
      { title: string; subject: string; description: string }
    > = {
      [EmailAuthCodePurpose.LOGIN]: {
        title: 'Код для входа',
        subject: `${appName}: код для входа`,
        description: 'Используйте этот код, чтобы войти в аккаунт.',
      },
      [EmailAuthCodePurpose.LOGIN_2FA]: {
        title: 'Код подтверждения входа',
        subject: `${appName}: подтверждение входа`,
        description: 'Используйте этот код как второй шаг, чтобы завершить вход.',
      },
      [EmailAuthCodePurpose.REGISTER]: {
        title: 'Код подтверждения регистрации',
        subject: `${appName}: код подтверждения регистрации`,
        description: 'Используйте этот код, чтобы завершить регистрацию аккаунта.',
      },
      [EmailAuthCodePurpose.PASSWORD_RESET]: {
        title: 'Код для смены пароля',
        subject: `${appName}: код для смены пароля`,
        description: 'Используйте этот код, чтобы задать новый пароль.',
      },
    };

    const copy = purposeCopy[context.purpose];

    const text = [
      copy.title,
      '',
      copy.description,
      `Код: ${context.code}`,
      `Код действует ${context.expiresInMinutes} минут.`,
      '',
      'Если вы не запрашивали этот код, просто проигнорируйте письмо.',
    ].join('\n');

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;background:#f4f7fb;padding:24px;color:#16243d;">
        <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid rgba(219,227,239,.92);border-radius:24px;padding:32px;">
          <p style="margin:0 0 8px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#6b7a90;">${appName}</p>
          <h1 style="margin:0 0 12px;font-size:24px;line-height:1.2;">${copy.title}</h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4d5e79;">${copy.description}</p>
          <div style="margin:0 0 24px;padding:20px;border-radius:20px;background:linear-gradient(180deg,#f8fbff,#eef4ff);border:1px solid rgba(186,197,214,.9);text-align:center;">
            <div style="font-size:34px;font-weight:800;letter-spacing:.24em;color:#183bff;">${context.code}</div>
          </div>
          <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#4d5e79;">Код действует ${context.expiresInMinutes} минут.</p>
          <p style="margin:0;font-size:14px;line-height:1.6;color:#4d5e79;">Если вы не запрашивали этот код, просто проигнорируйте письмо.</p>
        </div>
      </div>
    `;

    return {
      subject: copy.subject,
      text,
      html,
    };
  }

  private getTransporter(): Transporter {
    if (this.transporter) {
      return this.transporter;
    }

    const smtp = this.getConfig().mail.smtp;

    this.transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: smtp.user
        ? {
            user: smtp.user,
            pass: smtp.password,
          }
        : undefined,
    });

    return this.transporter;
  }

  private getConfig(): AppConfig {
    const config = this.configService.get<AppConfig>('appConfig');

    if (!config) {
      throw new ServiceUnavailableException('Конфигурация приложения недоступна.');
    }

    return config;
  }

  private maskEmail(email: string): string {
    const normalized = email.trim().toLowerCase();
    const [localPart, domainPart = ''] = normalized.split('@');
    const [domainName, ...domainTail] = domainPart.split('.');

    const maskChunk = (value: string, visible = 2): string => {
      if (value.length <= visible) {
        return '*'.repeat(Math.max(2, value.length));
      }

      return `${value.slice(0, visible)}${'*'.repeat(Math.max(2, value.length - visible))}`;
    };

    const maskedDomainTail = domainTail.join('.');
    return `${maskChunk(localPart)}@${maskChunk(domainName)}${maskedDomainTail ? `.${maskedDomainTail}` : ''}`;
  }
}
