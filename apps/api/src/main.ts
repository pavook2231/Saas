import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { json, NextFunction, Request, Response, urlencoded } from 'express';

import { AppModule } from './app.module';
import { AppConfig } from './config/app.config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const configService = app.get<ConfigService>(ConfigService);
  const config = configService.get<AppConfig>('appConfig');

  app.setGlobalPrefix('api');

  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.disable('x-powered-by');

  if (config?.security.trustProxy) {
    expressApp.set('trust proxy', 1);
  }

  app.use(json({ limit: config?.security.requestBodyLimit ?? '1mb' }));
  app.use(
    urlencoded({
      extended: true,
      limit: config?.security.requestBodyLimit ?? '1mb',
    }),
  );

  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    res.setHeader('Origin-Agent-Cluster', '?1');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );

    if (req.path.startsWith('/api/auth')) {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Pragma', 'no-cache');
    }

    if (config?.security.requireHttps) {
      const forwardedProtoHeader = req.headers['x-forwarded-proto'];
      const forwardedProto = Array.isArray(forwardedProtoHeader)
        ? forwardedProtoHeader[0]
        : forwardedProtoHeader;
      const isSecure =
        req.secure || (typeof forwardedProto === 'string' && forwardedProto === 'https');

      if (!isSecure) {
        res.status(426).json({
          statusCode: 426,
          message: 'HTTPS is required',
        });
        return;
      }

      res.setHeader(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains; preload',
      );
    }

    next();
  });

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      const allowedOrigins = config?.app.corsOrigins ?? ['http://localhost:3000'];

      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('CORS origin is not allowed'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Accept', 'Content-Type', 'Authorization', 'X-CSRF-Token'],
    maxAge: 600,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const port = config?.app.port ?? 3001;
  await app.listen(port);
}

bootstrap();
