import { NestFactory } from '@nestjs/core';
import { join } from 'node:path';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';

async function bootstrap() {
  // Compiled to api/dist/main.js; the Angular build lands in web/dist/web/browser.
  const webRoot = join(import.meta.dirname, '../../web/dist/web/browser');
  const app = configureApp(
    await NestFactory.create(AppModule.register({ webRoot })),
  );
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
