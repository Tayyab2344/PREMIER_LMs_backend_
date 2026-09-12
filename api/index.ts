import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app-setup';
import { ExpressAdapter } from '@nestjs/platform-express';
import express, { Express } from 'express';

let cachedServer: Express | null = null;
let bootstrapPromise: Promise<Express> | null = null;

async function bootstrapServer(): Promise<Express> {
  const expressApp = express();
  const adapter = new ExpressAdapter(expressApp);
  const app = await NestFactory.create(AppModule, adapter, {
    logger: ['error', 'warn', 'log'],
  });

  configureApp(app);
  await app.init();
  return expressApp;
}

export default async (req: any, res: any) => {
  try {
    if (!cachedServer) {
      if (!bootstrapPromise) {
        bootstrapPromise = bootstrapServer().catch((err) => {
          bootstrapPromise = null;
          throw err;
        });
      }
      cachedServer = await bootstrapPromise;
    }
    return cachedServer(req, res);
  } catch (err: any) {
    console.error('🚨 Vercel Serverless Bootstrap Error:', err);
    return res.status(500).json({
      statusCode: 500,
      error: 'Internal Server Error',
      message: err?.message || 'Server initialization failed.',
      timestamp: new Date().toISOString(),
    });
  }
};
