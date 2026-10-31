import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';

const CALLBACK = 'https://roto.example/api/auth/discord/callback';

describe('redirecting to the canonical hostname', () => {
  let app: INestApplication<App>;
  let webRoot: string;

  /** A real app, so the redirect is checked in front of everything it serves. */
  async function startApp(redirectUri: string) {
    vi.stubEnv('DISCORD_REDIRECT_URI', redirectUri);
    webRoot = mkdtempSync(join(tmpdir(), 'web-root-'));
    writeFileSync(join(webRoot, 'index.html'), '<app-root></app-root>');
    app = configureApp(
      await NestFactory.create<INestApplication<App>>(
        AppModule.register({ webRoot }),
        {
          logger: false,
        },
      ),
    );
    await app.init();
  }

  function get(path: string, host: string) {
    return request(app.getHttpServer()).get(path).set('Host', host);
  }

  afterEach(async () => {
    await app.close();
    rmSync(webRoot, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it('permanently redirects a herokuapp.com hostname, keeping the path and query', async () => {
    await startApp(CALLBACK);

    const res = await get(
      '/drafts/42?tab=queue',
      'swantisserie-abc123.herokuapp.com',
    ).expect(308);

    expect(res.headers.location).toBe(
      'https://roto.example/drafts/42?tab=queue',
    );
  });

  it('permanently redirects www. plus the canonical hostname', async () => {
    await startApp(CALLBACK);

    const res = await get('/drafts/42?tab=queue', 'www.roto.example').expect(
      308,
    );

    expect(res.headers.location).toBe(
      'https://roto.example/drafts/42?tab=queue',
    );
  });

  it.each(['roto.example', 'localhost', 'localhost:4200', 'other.example'])(
    'serves requests on %s as normal',
    async (host) => {
      await startApp(CALLBACK);

      await get('/drafts/42', host).expect(200);
    },
  );

  it('serves the herokuapp.com address as normal while the redirect URI still points at it', async () => {
    await startApp(
      'https://swantisserie-abc123.herokuapp.com/api/auth/discord/callback',
    );

    await get('/drafts/42', 'swantisserie-abc123.herokuapp.com').expect(200);
  });

  it('serves an HTTP/1.0 request with no Host header as normal', async () => {
    await startApp(CALLBACK);
    await app.listen(0);
    const { port } = new URL(await app.getUrl());

    const response = await new Promise<string>((resolve, reject) => {
      let received = '';
      connect(Number(port), 'localhost')
        .on('error', reject)
        .on('data', (chunk) => (received += chunk.toString()))
        .on('end', () => resolve(received))
        .write('GET /drafts/42 HTTP/1.0\r\n\r\n');
    });

    expect(response).toMatch(/^HTTP\/1\.1 200/);
  });

  it('permanently redirects plain HTTP on the canonical hostname to HTTPS, keeping the path and query', async () => {
    await startApp(CALLBACK);

    const res = await get('/drafts/42?tab=queue', 'roto.example')
      .set('X-Forwarded-Proto', 'http')
      .expect(308);

    expect(res.headers.location).toBe(
      'https://roto.example/drafts/42?tab=queue',
    );
  });

  it('redirects plain HTTP before starting sign-in, so no cookie is set', async () => {
    vi.stubEnv('DISCORD_CLIENT_ID', 'client-123');
    await startApp(CALLBACK);

    const res = await get('/api/auth/discord', 'roto.example')
      .set('X-Forwarded-Proto', 'http')
      .expect(308);

    expect(res.headers.location).toBe('https://roto.example/api/auth/discord');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('serves HTTPS on the canonical hostname as normal', async () => {
    await startApp(CALLBACK);

    await get('/drafts/42', 'roto.example')
      .set('X-Forwarded-Proto', 'https')
      .expect(200);
  });

  it('serves plain HTTP as normal when the redirect URI is itself plain HTTP', async () => {
    await startApp('http://localhost:4200/api/auth/discord/callback');

    await get('/drafts/42', 'localhost:4200')
      .set('X-Forwarded-Proto', 'http')
      .expect(200);
  });

  it('starts sign-in on the canonical hostname', async () => {
    vi.stubEnv('DISCORD_CLIENT_ID', 'client-123');
    await startApp(CALLBACK);

    const res = await get('/api/auth/discord', 'roto.example').expect(302);

    expect(res.headers.location).toContain('discord.com');
    expect(res.headers['set-cookie']?.[0]).toContain('oauth_state=');
  });

  it('opens a Socket.IO connection on the canonical hostname', async () => {
    await startApp(CALLBACK);

    const res = await get(
      '/api/socket.io/?EIO=4&transport=polling',
      'roto.example',
    ).expect(200);

    expect(res.text).toContain('"sid"');
  });
});
