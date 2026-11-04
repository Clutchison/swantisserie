import pg from 'pg';
import { raceServer, startRaceDatabase } from './race-database.js';

describe('the race database', () => {
  const local = 'postgresql://postgres@127.0.0.1:5432/postgres';

  it('is skipped when RACE_DATABASE_URL is unset, whatever DATABASE_URL and DIRECT_URL say', () => {
    expect(
      raceServer({ DATABASE_URL: local, DIRECT_URL: local }),
    ).toBeUndefined();
  });

  it('may be made on a server on this machine', () => {
    for (const host of ['localhost', '127.0.0.1']) {
      const url = `postgresql://postgres@${host}:5432/postgres`;
      expect(raceServer({ RACE_DATABASE_URL: url })?.hostname).toBe(host);
    }
  });

  it.each([
    [
      'a server on another machine',
      { RACE_DATABASE_URL: 'postgresql://postgres@db.example.com/postgres' },
      'must be localhost or 127.0.0.1',
    ],
    [
      'a Neon host',
      {
        RACE_DATABASE_URL:
          'postgresql://app@ep-cool-sun-123.us-east-2.aws.neon.tech/neondb',
      },
      'must not be a Neon host',
    ],
    [
      'DATABASE_URL',
      { RACE_DATABASE_URL: local, DATABASE_URL: local },
      "must not name DATABASE_URL's database",
    ],
    [
      'DIRECT_URL, written another way',
      {
        RACE_DATABASE_URL: local,
        DIRECT_URL: 'postgresql://other:secret@127.0.0.1/postgres',
      },
      "must not name DIRECT_URL's database",
    ],
  ])('refuses to start on %s, without connecting', async (_, env, message) => {
    const connect = vi.spyOn(pg.Client.prototype, 'connect');

    await expect(startRaceDatabase(env)).rejects.toThrow(message);

    expect(connect).not.toHaveBeenCalled();
  });
});
