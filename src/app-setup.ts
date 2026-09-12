import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

export function configureApp(app: INestApplication) {
  const configService = app.get(ConfigService);

  // Mandatory Security Environment Validation
  const jwtSecret = configService.get<string>('JWT_SECRET');
  if (!jwtSecret || jwtSecret.trim().length < 32) {
    throw new Error(
      '🚨 FATAL SECURITY ERROR: JWT_SECRET environment variable is missing, empty, or shorter than 32 characters. Server startup halted to protect auth tokens.'
    );
  }

  // Security
  app.use(helmet());
  
  // CORS Configuration: Explicit whitelist
  const configuredOrigins = (configService.get<string>('ALLOWED_ORIGINS') || configService.get<string>('CORS_ORIGIN') || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

  const defaultOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://premier-lms-frontend.vercel.app',
    'https://www.premiertaxschool.com',
    'https://premiertaxschool.com',
  ];

  const allowedOrigins = Array.from(new Set([...defaultOrigins, ...configuredOrigins]));

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow requests with no origin (e.g. mobile apps, server-to-server curl)
      if (!origin) return callback(null, true);
      
      const cleanOrigin = origin.replace(/\/$/, '');
      const isAllowed = allowedOrigins.some(o => o.replace(/\/$/, '') === cleanOrigin) ||
                        cleanOrigin.endsWith('.vercel.app');

      if (isAllowed) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-zm-signature', 'x-zm-request-timestamp'],
  });

  // Global validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global filters and interceptors
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  // API prefix
  app.setGlobalPrefix('api', {
    exclude: ['/'],
  });
}
