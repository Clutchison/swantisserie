import { INestApplication, Type } from '@nestjs/common';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../app.module.js';
import { configureApp } from '../app.setup.js';
import { AdminConfig } from '../auth/admin-config.js';
import { SessionService } from '../auth/session.service.js';
import { CubeCobraClient } from '../cubecobra/cubecobra-client.js';
import { DiscordClient } from '../discord/discord-client.js';
import { DiscordConfig } from '../discord/discord-config.js';
import { DraftNotifierRetries } from '../discord/draft-notifier.js';
import { WebhookClient } from '../discord/webhook-client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ScryfallClient } from '../scryfall/scryfall-client.js';
import { startTestDatabase, TestDatabase } from './test-database.js';

export const alice = { id: '80351110224678912', name: 'Alice' };
export const bob = { id: '80351110224678913', name: 'Bob' };
/** Carol is an app admin, unless a spec overrides `AdminConfig`. */
export const carol = { id: '80351110224678914', name: 'Carol' };

/**
 * Stand-ins for every client that calls out over the network, which
 * `startTestApp` wires in so no test reaches the real services. Each test
 * starts with them reset, answering `undefined`.
 */
export const scryfall = {
  search: vi.fn<ScryfallClient['search']>(),
  printingsOn: vi.fn<ScryfallClient['printingsOn']>(),
};
export const cubeCobra = { cube: vi.fn<CubeCobraClient['cube']>() };
export const webhookClient = { post: vi.fn<WebhookClient['post']>() };
export const discord = {
  exchangeCode: vi.fn<DiscordClient['exchangeCode']>(),
  getCurrentUser: vi.fn<DiscordClient['getCurrentUser']>(),
  isGuildMember: vi.fn<DiscordClient['isGuildMember']>(),
};

/** A provider's token, as `overrideProvider` takes it. */
type Token = Parameters<TestingModuleBuilder['overrideProvider']>[0];

export interface TestAppOptions {
  /** Values to provide in place of the app's own providers or the defaults here. */
  overrides?: { provide: Token; useValue: unknown }[];
  /** Modules to import alongside the app, such as a stand-in controller. */
  imports?: Type[];
}

/** What `startTestApp` provides unless told otherwise. */
function defaults(): Map<Token, unknown> {
  return new Map<Token, unknown>([
    [ScryfallClient, scryfall],
    [CubeCobraClient, cubeCobra],
    [WebhookClient, webhookClient],
    [DiscordClient, discord],
    [AdminConfig, new AdminConfig(carol.id)],
    // Drafts' pages are at https://roto.example/drafts/:id.
    [
      DiscordConfig,
      new DiscordConfig({
        DISCORD_REDIRECT_URI: 'https://roto.example/api/auth/discord/callback',
      }),
    ],
    // Retried at once, so tests needn't wait.
    [DraftNotifierRetries, new DraftNotifierRetries([0, 0])],
  ]);
}

let database: TestDatabase;
/** The app `startTestApp` started last. */
export let app: INestApplication<App>;

/**
 * Registers the hooks that give each test a fresh test database and a
 * running app, started by `start`, and close the app after it. The fakes are
 * reset before `start` runs, so it may stub them.
 */
export function useTestApp(start: () => Promise<unknown> = startTestApp) {
  beforeAll(async () => {
    database = await startTestDatabase();
    process.env.DATABASE_URL = database.url;
  });

  afterAll(async () => {
    await database.stop();
  });

  beforeEach(async () => {
    await database.reset();
    vi.resetAllMocks();
    await start();
  });

  afterEach(async () => {
    await app.close();
  });
}

/** Delays every reply from the test database by `ms`, for this test. */
export function slowDownDatabase(ms: number) {
  database.slowDown(ms);
}

/**
 * Starts the app on the test database `useTestApp` started, as `app`, with
 * every outbound client faked unless `overrides` provides its own.
 */
export async function startTestApp({
  overrides = [],
  imports = [],
}: TestAppOptions = {}): Promise<INestApplication<App>> {
  const values = defaults();
  for (const { provide, useValue } of overrides) values.set(provide, useValue);

  let builder = Test.createTestingModule({
    imports: [AppModule.register({ webRoot: import.meta.dirname }), ...imports],
  });
  for (const [token, value] of values) {
    builder = builder.overrideProvider(token).useValue(value);
  }
  const moduleRef = await builder.compile();

  const started = configureApp(moduleRef.createNestApplication());
  await started.init();
  app = started;
  return started;
}

/**
 * Signs `user` in, answering with `session=<token>` for a Cookie header.
 * Safe to call again for the same user. Signing in through Discord is
 * covered by the auth tests.
 */
export async function signIn(user: {
  id: string;
  name: string;
  avatar?: string;
}) {
  await app.get(PrismaService).user.upsert({
    where: { id: user.id },
    create: user,
    update: {},
  });
  const { token } = await app.get(SessionService).create(user.id);
  return `session=${token}`;
}

/** The `#roto-main` webhook's URL, as `registerWebhook` registers it. */
export const webhookUrl =
  'https://discord.com/api/webhooks/1234567890/secret-token';

/**
 * Sends a request to `path` under `/api/admin/webhooks` as Carol, an app
 * admin, sending `body` when there is one, and expects `status`.
 */
async function webhooksRequest(
  method: 'post' | 'patch' | 'delete',
  path: string,
  status: number,
  body?: object,
) {
  const req = request(app.getHttpServer())
    [method](`/api/admin/webhooks${path}`)
    .set('Cookie', await signIn(carol));
  return (body === undefined ? req : req.send(body)).expect(status);
}

/** Registers a webhook as Carol, an app admin, answering with its id. */
export async function registerWebhook(name = '#roto-main', url = webhookUrl) {
  const res = await webhooksRequest('post', '', 201, { name, url });
  return res.body.id as string;
}

/** Renames a webhook as Carol, an app admin. */
export async function renameWebhook(id: string, name: string) {
  await webhooksRequest('patch', `/${id}`, 200, { name });
}

/** Removes a webhook as Carol, an app admin. */
export async function removeWebhook(id: string) {
  await webhooksRequest('delete', `/${id}`, 204);
}
