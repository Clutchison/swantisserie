import pg from 'pg';
import { raceServer, startRaceDatabase } from './race-database.js';

const server = raceServer(process.env);

describe.skipIf(!server)('the race database, on a real Postgres', () => {
  /** The databases on the server, by name. */
  async function databases(): Promise<string[]> {
    const client = new pg.Client({ connectionString: server!.href });
    await client.connect();
    try {
      const { rows } = await client.query<{ datname: string }>(
        'SELECT datname FROM pg_database',
      );
      return rows.map((row) => row.datname).sort();
    } finally {
      await client.end();
    }
  }

  it('is a database of its own, with the migrations applied, dropped once stopped', async () => {
    const before = await databases();

    const database = await startRaceDatabase();
    expect(database.name).toMatch(/^race_[0-9a-f]{16}$/);
    expect(before).not.toContain(database.name);
    expect(await databases()).toEqual([...before, database.name].sort());
    const client = new pg.Client({ connectionString: database.url });
    await client.connect();
    const { rows } = await client.query(`SELECT count(*) FROM "Draft"`);
    await client.end();
    expect(rows).toEqual([{ count: '0' }]);
    await database.reset();
    await database.stop();

    expect(await databases()).toEqual(before);
  });
});
