import request from 'supertest';
import {
  aliceCookie,
  app,
  bob,
  playingTournament,
  signIn,
  useDraftsApp,
} from './tournament-harness.js';

useDraftsApp();

let bobCookie: string;

beforeEach(async () => {
  bobCookie = await signIn(bob);
});

describe('signed out', () => {
  it('is refused every tournament request, read or change', async () => {
    const id = await playingTournament([aliceCookie, bobCookie]);
    const routes: ['get' | 'post' | 'put' | 'delete', string][] = [
      ['get', ''],
      ['post', ''],
      ['delete', ''],
      ['post', '/entries'],
      ['delete', `/entries/${bob.id}`],
      ['put', '/ready'],
      ['delete', '/ready'],
      ['post', `/entries/${bob.id}/drop`],
      ['delete', `/entries/${bob.id}/drop`],
      ['post', '/start'],
      ['post', '/matches/m/report'],
      ['post', '/matches/m/confirm'],
      ['put', '/matches/m/game-score'],
      ['delete', '/matches/m/game-score'],
      ['post', '/complete'],
      ['post', '/complete-round'],
      ['post', '/reopen-round'],
      ['get', '/decklists'],
    ];
    for (const [method, path] of routes) {
      await request(app.getHttpServer())
        [method](`/api/drafts/${id}/tournament${path}`)
        .expect(401);
    }
  });
});
