import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../app.module.js';
import { configureApp } from '../app.setup.js';
import { AdminConfig } from '../auth/admin-config.js';
import { SessionService } from '../auth/session.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { startTestDatabase, TestDatabase } from '../testing/test-database.js';
import { APP_VERSION_FILE } from './app-version.module.js';
import { AppVersion } from './app-version.js';

const API_ROOT = join(import.meta.dirname, '../..');
const RECORD_SCRIPT = join(API_ROOT, 'scripts/record-app-version.mjs');
const sha = '0123456789abcdef0123456789abcdef01234567';

describe('GET /api/admin/app-version', () => {
  const alice = { id: '80351110224678912', name: 'Alice' };
  const carol = { id: '80351110224678914', name: 'Carol' };
  /** Carol is an app admin. */
  const admins = new AdminConfig(carol.id);
  /** The app version as if recorded at build time; each test sets its own. */
  const appVersion: { commit: string | null } = { commit: null };

  let database: TestDatabase;
  let app: INestApplication<App>;

  beforeAll(async () => {
    database = await startTestDatabase();
    process.env.DATABASE_URL = database.url;
  });

  afterAll(async () => {
    await database.stop();
  });

  beforeEach(async () => {
    await database.reset();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register({ webRoot: import.meta.dirname })],
    })
      .overrideProvider(AdminConfig)
      .useValue(admins)
      .overrideProvider(AppVersion)
      .useValue(appVersion)
      .compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  /** Signing in through Discord is covered by the auth tests. */
  async function signIn(user: { id: string; name: string }) {
    await app.get(PrismaService).user.create({ data: user });
    const { token } = await app.get(SessionService).create(user.id);
    return `session=${token}`;
  }

  const get = () => request(app.getHttpServer()).get('/api/admin/app-version');

  it('is the commit the API was built from, for app admins', async () => {
    appVersion.commit = sha;

    await get()
      .set('Cookie', await signIn(carol))
      .expect(200)
      .expect({ commit: sha });
  });

  it('is null when the build did not record a commit', async () => {
    appVersion.commit = null;

    await get()
      .set('Cookie', await signIn(carol))
      .expect(200)
      .expect({ commit: null });
  });

  it('is hidden from signed-in users who are not app admins', async () => {
    appVersion.commit = sha;

    await get()
      .set('Cookie', await signIn(alice))
      .expect(403);
  });

  it('is hidden from signed-out requests', async () => {
    appVersion.commit = sha;

    await get().expect(401);
  });
});

describe('recording the app version at build time', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'app-version-'));
    file = join(dir, 'dist', 'app-version.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /** Runs the build's record step as Heroku would, with `sourceVersion` as SOURCE_VERSION. */
  function record(sourceVersion: string | undefined) {
    const env = { ...process.env };
    delete env.SOURCE_VERSION;
    if (sourceVersion !== undefined) env.SOURCE_VERSION = sourceVersion;
    execFileSync(process.execPath, [RECORD_SCRIPT, file], { env });
  }

  it('keeps the commit Heroku is deploying', () => {
    record(sha);

    expect(AppVersion.read(file).commit).toBe(sha);
  });

  it('records an unknown version when SOURCE_VERSION is missing', () => {
    record(undefined);

    expect(AppVersion.read(file).commit).toBeNull();
  });

  it('records an unknown version when SOURCE_VERSION is blank', () => {
    record('  ');

    expect(AppVersion.read(file).commit).toBeNull();
  });

  it('reads as unknown when nothing was recorded, as in local dev', () => {
    expect(AppVersion.read(file).commit).toBeNull();
  });

  it('is recorded by the build where the running API reads it', () => {
    const { scripts } = JSON.parse(
      readFileSync(join(API_ROOT, 'package.json'), 'utf8'),
    ) as {
      scripts: { build: string };
    };
    const output = /record-app-version\.mjs (\S+)/.exec(scripts.build)?.[1];

    // The build compiles src/ into dist/, so the API reads from the matching place in each.
    expect(output).toBeDefined();
    expect(relative(join(API_ROOT, 'dist'), join(API_ROOT, output!))).toBe(
      relative(join(API_ROOT, 'src'), APP_VERSION_FILE),
    );
  });
});
