import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

export function configureApp(app: INestApplication) {
  const configService = app.get(ConfigService);

  // Security
  app.use(helmet());
  
  const isDev = configService.get<string>('NODE_ENV', 'development') === 'development';
  const corsOrigins = configService.get<string>('CORS_ORIGIN', 'http://localhost:3000')
    .split(',')
    .map(o => o.trim());

  app.enableCors({
    origin: isDev ? true : corsOrigins,
    credentials: true,
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
