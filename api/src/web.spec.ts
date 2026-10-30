import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';

const INDEX_HTML =
  '<!doctype html><title>Swantisserie</title><app-root></app-root>';

describe('serving the web app', () => {
  let app: INestApplication<App>;
  let webRoot: string;

  beforeEach(async () => {
    webRoot = mkdtempSync(join(tmpdir(), 'web-root-'));
    writeFileSync(join(webRoot, 'index.html'), INDEX_HTML);

    // A real app rather than Test.createTestingModule: ServeStaticModule picks
    // its HTTP loader while providers are built, before a testing module has
    // an adapter attached. Prisma connects lazily, so no database is needed.
    app = configureApp(
      await NestFactory.create<INestApplication<App>>(
        AppModule.register({ webRoot }),
        { logger: false },
      ),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    rmSync(webRoot, { recursive: true, force: true });
  });

  it('serves index.html at the root', async () => {
    const res = await request(app.getHttpServer()).get('/').expect(200);

    expect(res.text).toBe(INDEX_HTML);
  });

  it('serves index.html for client-side routes', async () => {
    const res = await request(app.getHttpServer())
      .get('/drafts/42')
      .expect(200);

    expect(res.text).toBe(INDEX_HTML);
  });

  it('answers unknown API routes with a JSON 404, not the web app', async () => {
    const res = await request(app.getHttpServer()).get('/api/nope').expect(404);

    expect(res.body).toMatchObject({ statusCode: 404 });
  });
});
