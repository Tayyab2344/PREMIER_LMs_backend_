import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { configureApp } from './app-setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  const configService = app.get(ConfigService);
  const port = process.env.PORT || configService.get<number>('API_PORT', 3001);
  const host = configService.get<string>('API_HOST', '0.0.0.0');

  configureApp(app);

  await app.listen(port, host);
  console.log(`🚀 Premier LMS API running on http://${host}:${port}`);

  // Keep Render container alive (Render free-tier sleeps after 15m idle)
  const renderExternalUrl = process.env.RENDER_EXTERNAL_URL || 'https://premier-lms-backend-1.onrender.com';
  if (process.env.NODE_ENV === 'production' && (process.env.RENDER || process.env.RENDER_EXTERNAL_URL)) {
    console.log(`[KeepAlive] Automated pinger active for ${renderExternalUrl}`);
    setInterval(async () => {
      try {
        await fetch(`${renderExternalUrl}/`);
      } catch (_) {
        // Silently ignore ping failures
      }
    }, 10 * 60 * 1000); // Every 10 minutes
  }
}

bootstrap();

