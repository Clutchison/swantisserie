import { databaseBefore } from '../../testing/migrations.js';

const CLEARED_OFF_NOTICE = '20261124130000_cleared_off_notice';

describe('the cleared off notice migration', () => {
  it('hides the cleared cards on every Queue notice, keeping their rows for undo, and leaves the lost cards listed', async () => {
    const { db, applyMigration } = await databaseBefore(CLEARED_OFF_NOTICE);
    // Only these rows matter, so the rows they refer to needn't exist.
    await db.exec(`
      SET session_replication_role = replica;
      INSERT INTO "Pick" ("id", "draftId", "number", "playerId", "poolCardId")
        VALUES ('pick', 'draft', 1, 'picker', 'bolt');
      INSERT INTO "UnqueuedCard" ("id", "pickId", "playerId", "poolCardId", "position", "noticeHidden", "restKept")
        VALUES ('lost', 'pick', 'player', 'bolt', 1, false, false),
               ('cleared', 'pick', 'player', 'shock', 0, false, false),
               ('dismissed', 'pick', 'player', 'spike', 2, true, false);
    `);

    await applyMigration();

    const takenOut = await db.query(
      `SELECT "id", "noticeHidden", "restKept" FROM "UnqueuedCard" ORDER BY "position"`,
    );
    expect(takenOut.rows).toEqual([
      { id: 'cleared', noticeHidden: true, restKept: false },
      { id: 'lost', noticeHidden: false, restKept: false },
      { id: 'dismissed', noticeHidden: true, restKept: false },
    ]);
    await db.close();
    // Starting Postgres and applying every migration can pass 5s on CI.
  }, 30_000);
});
