import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { configureApp } from './app-setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  const configService = app.get(ConfigService);
  const port = process.env.PORT || configService.get<number>('API_PORT', 3001);
  const host = configService.get<string>('API_HOST', '127.0.0.1');

  configureApp(app);

  await app.listen(port, host);
  console.log(`🚀 Premier LMS API running on http://${host}:${port}`);
}

bootstrap();

