import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app-setup';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';

const server = express();

export const bootstrap = async () => {
  const app = await NestFactory.create(AppModule, new ExpressAdapter(server));
  configureApp(app);
  await app.init();
};

let isBootstrapped = false;

export default async (req: any, res: any) => {
  if (!isBootstrapped) {
    await bootstrap();
    isBootstrapped = true;
  }
  server(req, res);
};
