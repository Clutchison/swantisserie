import {
  alice,
  bob,
  carol,
  aliceCookie,
  useDraftsApp,
  signIn,
  getDraft,
  readyDraft,
  draftWithRunningSnapshot,
  snapshotted,
  page,
  start,
  pickLog,
  previewPickImport,
} from './harness.js';

useDraftsApp();

describe('pick import preview', () => {
  /** Made up: 'Ann' and 'Ben' are not the draft's players' names. */
  const csv = [
    ',Ann,Ben,',
    '->,ash golem,"Brine Wisp",',
    ',,Cinder Hound,<-',
  ].join('\n');
  const cards = ['Ash Golem', 'Brine Wisp', 'Cinder Hound', 'Dusk Heron'];

  it('pairs columns with seats by position, counts the picks and names the next turn', async () => {
    const id = await readyDraft([aliceCookie, await signIn(bob)], 2, cards);

    const answer = await previewPickImport(id, csv).expect(200);

    expect(answer.body).toEqual({
      seats: [
        { column: 'Ann', playerId: alice.id, player: 'Alice' },
        { column: 'Ben', playerId: bob.id, player: 'Bob' },
      ],
      picks: 3,
      next: { pick: 4, player: 'Alice' },
    });
  });

  it('changes nothing in the draft', async () => {
    const id = await readyDraft([aliceCookie, await signIn(bob)], 2, cards);
    const before = await getDraft(id).expect(200);

    await previewPickImport(id, csv).expect(200);

    expect((await getDraft(id).expect(200)).body).toEqual(before.body);
    const picks = await pickLog(id);
    expect(picks.body).toEqual([]);
  });

  it('reports every problem in the file, with nothing changed', async () => {
    const bobCookie = await signIn(bob);
    const id = await readyDraft([aliceCookie, bobCookie], 2, cards);

    const refused = await previewPickImport(
      id,
      ',Ann,Ben,\n->,Ash Golem,Fen Lurker,\n,Ash Golem,,<-',
    ).expect(422);

    expect(refused.body).toEqual({
      error: 'invalid-pick-import',
      message: 'This file can’t be imported.',
      problems: [
        'Round 2 has no pick for Ben, but later picks are filled in.',
        'Fen Lurker isn’t in this draft’s pool.',
        'Ash Golem appears more than once.',
      ],
    });
  });

  it('is for the organizer and app admins, not other guild members', async () => {
    const bobCookie = await signIn(bob);
    const id = await readyDraft([aliceCookie, bobCookie], 2, cards);

    await previewPickImport(id, csv, bobCookie).expect(403);
    await previewPickImport(id, csv, await signIn(carol)).expect(200);
  });

  it('answers 404 for a draft that does not exist', async () => {
    await previewPickImport('no-such-draft', csv).expect(404);
  });

  it('refuses a draft that has left the lobby', async () => {
    const id = await readyDraft([aliceCookie, await signIn(bob)], 2, cards);
    await start(id).expect(200);

    const refused = await previewPickImport(id, csv).expect(409);

    expect(refused.body.error).toBe('draft-started');
  });

  it('refuses until the pool snapshot is complete', async () => {
    const { id, answer } = await draftWithRunningSnapshot();

    const refused = await previewPickImport(id, csv).expect(409);

    expect(refused.body.error).toBe('pool-not-ready');
    // Shutting down waits for the snapshot, so let it finish.
    answer.resolve(page('Lightning Bolt'));
    await snapshotted(id);
  });

  it('refuses a draft that fails the start checks', async () => {
    const tooFew = await readyDraft([aliceCookie], 1, cards);
    expect((await previewPickImport(tooFew, csv).expect(409)).body.error).toBe(
      'player-count',
    );

    const tooBig = await readyDraft([aliceCookie, await signIn(bob)], 3, cards);
    expect((await previewPickImport(tooBig, csv).expect(409)).body.error).toBe(
      'pool-too-small',
    );
  });

  it('refuses a file over the size limit', async () => {
    const id = await readyDraft([aliceCookie, await signIn(bob)], 2, cards);

    const refused = await previewPickImport(
      id,
      `${csv}\n${' '.repeat(70_000)}`,
    ).expect(413);

    expect(refused.body.error).toBe('file-too-large');
  });

  it('refuses a request with no file text', async () => {
    const id = await readyDraft([aliceCookie, await signIn(bob)], 2, cards);

    await previewPickImport(id, undefined).expect(400);
  });
});
