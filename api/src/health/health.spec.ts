import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../app.module.js';
import { configureApp } from '../app.setup.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('GET /api/health', () => {
  let app: INestApplication<App>;
  const db = { $queryRaw: vi.fn() };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register({ webRoot: import.meta.dirname })],
    })
      .overrideProvider(PrismaService)
      .useValue(db)
      .compile();

    app = configureApp(moduleRef.createNestApplication());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('reports API ok and DB ok when the database answers', async () => {
    db.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    await request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect({ api: 'ok', db: 'ok' });
  });

  it('reports DB error with 503 when the database query fails', async () => {
    db.$queryRaw.mockRejectedValue(new Error('connection refused'));

    await request(app.getHttpServer())
      .get('/api/health')
      .expect(503)
      .expect({ api: 'ok', db: 'error' });
  });
});
