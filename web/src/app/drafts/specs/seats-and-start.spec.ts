import { TestBed } from '@angular/core/testing';
import { EMPTY_QUEUE } from '../drafts';
import {
  useDraftsApp,
  alice,
  draft,
  http,
  updates,
  openUrl,
  section,
  bob,
  alicePlayer,
  openDraft,
  flushQueue,
  flushPicks,
  flushPool,
  completeSnapshot,
  button,
  type AppFixture,
} from './harness';

useDraftsApp();

describe('seats and start', () => {
  const seatNames = (page: HTMLElement) =>
    [...section(page, 'Players').querySelectorAll('li .name')].map((n) => n.textContent);

  it('shows the seat order and whose turn it is', async () => {
    const { page } = await openDraft(completeSnapshot, {
      state: 'Drafting',
      players: [bob, alicePlayer],
      turn: { pick: 1, round: 1, playerId: bob.id },
    });

    expect(seatNames(page)).toEqual(['Bob', 'Alice']);
    expect(page.textContent).toContain('Bob’s turn: pick 1, round 1');
    const current = section(page, 'Players').querySelector('li[aria-current="true"]');
    expect(current?.querySelector('.name')?.textContent).toBe('Bob');
  });

  it('tells the signed-in player when it is their turn', async () => {
    const { page } = await openDraft(completeSnapshot, {
      state: 'Drafting',
      players: [alicePlayer, bob],
      turn: { pick: 1, round: 1, playerId: alice.id },
    });

    expect(page.textContent).toContain('Your turn: pick 1, round 1');
  });

  it('lets the organizer randomize the seats', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, { players: [alicePlayer, bob] });

    button(page, 'Randomize seats')!.click();
    const req = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/seats/randomize'));
    expect(req.request.method).toBe('POST');
    req.flush(draft({ players: [bob, alicePlayer] }));
    await fixture.whenStable();

    expect(seatNames(page)).toEqual(['Bob', 'Alice']);
  });

  it('lets the organizer move a seat earlier or later', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, { players: [alicePlayer, bob] });
    expect(button(page, 'Move Alice earlier')?.disabled).toBe(true);
    expect(button(page, 'Move Bob later')?.disabled).toBe(true);

    button(page, 'Move Bob earlier')!.click();
    const req = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/seats'));
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ userIds: [bob.id, alice.id] });
    req.flush(draft({ players: [bob, alicePlayer] }));
    await fixture.whenStable();

    expect(seatNames(page)).toEqual(['Bob', 'Alice']);
  });

  it('starts the draft for the organizer', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, { players: [alicePlayer, bob] });

    button(page, 'Start draft')!.click();
    const req = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/start'));
    expect(req.request.method).toBe('POST');
    req.flush(
      draft({
        state: 'Drafting',
        players: [alicePlayer, bob],
        turn: { pick: 1, round: 1, playerId: alice.id },
      }),
    );
    // A started draft has picks to show.
    await flushPicks([]);
    await fixture.whenStable();

    expect(page.textContent).toContain('Your turn: pick 1, round 1');
    expect(button(page, 'Start draft')).toBeUndefined();
    expect(button(page, 'Randomize seats')).toBeUndefined();
    expect(button(page, 'Move Bob earlier')).toBeUndefined();
  });

  it('says why a start was refused', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, { players: [alicePlayer, bob] });

    button(page, 'Start draft')!.click();
    const message = '2 players × 300 picks needs 600 cards, but the pool has 540.';
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/start'))).flush(
      { error: 'pool-too-small', message },
      { status: 409, statusText: 'Conflict' },
    );
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(
      draft({ players: [alicePlayer, bob] }),
    );
    await fixture.whenStable();

    expect(page.querySelector('[role="alert"]')?.textContent).toContain(message);
    expect(button(page, 'Start draft')).toBeDefined();
  });

  describe('pick import', () => {
    const text = ',Ann,Ben,\n->,Ash Golem,,';

    /** Chooses a made-up file and answers its preview with `answer`. */
    async function chooseFile(
      fixture: AppFixture,
      page: HTMLElement,
      answer: object,
      status = 200,
    ) {
      const input = page.querySelector<HTMLInputElement>('input[type="file"]')!;
      Object.defineProperty(input, 'files', {
        configurable: true,
        value: [new File([text], 'picks.csv', { type: 'text/csv' })],
      });
      input.dispatchEvent(new Event('change'));
      const req = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/pick-import/preview'));
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ csv: text });
      req.flush(answer, { status, statusText: status === 200 ? 'OK' : 'Refused' });
      await fixture.whenStable();
    }

    /** The answer's handling isn't tracked by stability, so wait for it to show. */
    const shownPreview = (page: HTMLElement) =>
      vi.waitFor(() => {
        const shown = page.querySelector('.pick-import-preview');
        if (!shown) throw new Error('No preview yet');
        return shown;
      });

    const preview = {
      seats: [
        { column: 'Ann', userId: alice.id, player: 'Alice' },
        { column: 'Ben', userId: bob.id, player: 'Bob' },
      ],
      picks: 70,
      next: { pick: 71, player: 'Bob' },
    };

    it('previews a valid file: the pairings, pick count and next turn', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, { players: [alicePlayer, bob] });
      expect(page.textContent).toContain('Import picks');

      await chooseFile(fixture, page, preview);

      const shown = (await shownPreview(page)).textContent;
      expect(shown).toContain('Ann → Alice');
      expect(shown).toContain('Ben → Bob');
      expect(shown).toContain('70 picks');
      expect(shown).toContain('Next turn: Pick 71, Bob');
    });

    describe('confirming', () => {
      async function previewed() {
        const opened = await openDraft(completeSnapshot, { players: [alicePlayer, bob] });
        await chooseFile(opened.fixture, opened.page, preview);
        await shownPreview(opened.page);
        return opened;
      }

      /** Confirms the import and answers it with `answer`. */
      async function confirmImport(page: HTMLElement, answer: object, status = 200) {
        button(page, 'Import and start paused')!.click();
        const req = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/pick-import'));
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toEqual({ csv: text, userIds: [alice.id, bob.id] });
        req.flush(answer, { status, statusText: status === 200 ? 'OK' : 'Refused' });
      }

      it('warns that the import is final and clears all queues', async () => {
        const { page } = await previewed();

        const shown = (await shownPreview(page)).textContent;
        expect(shown).toContain('Importing is final and clears all queues');
      });

      it('sends the same file text again and moves to the paused draft', async () => {
        const { fixture, page } = await previewed();

        await confirmImport(
          page,
          draft({
            state: 'Paused',
            players: [alicePlayer, bob],
            turn: { pick: 2, round: 1, playerId: bob.id },
            version: 1,
          }),
        );

        await vi.waitFor(() => {
          expect(page.querySelector('.pick-import-preview')).toBeNull();
          expect(button(page, 'Import picks')).toBeUndefined();
        });
        const picks = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/picks'));
        picks.flush([]);
        await flushQueue(EMPTY_QUEUE);
        await fixture.whenStable();
      });

      it('moves a viewer in the lobby to the paused draft and its picks without a reload', async () => {
        const { fixture, page } = await openDraft(completeSnapshot, {
          players: [alicePlayer, bob],
        });

        updates.events.next({
          type: 'changed',
          draft: draft({
            state: 'Paused',
            players: [alicePlayer, bob],
            turn: { pick: 2, round: 1, playerId: bob.id },
            version: 1,
          }),
        });

        const picks = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/picks'));
        picks.flush([
          {
            pick: 1,
            playerId: alice.id,
            oracleId: 'ash-golem-oracle',
            name: 'Ash Golem',
            layout: 'normal',
            set: 'tst',
            collectorNumber: '1',
          },
        ]);
        await flushQueue(EMPTY_QUEUE);
        await fixture.whenStable();

        await vi.waitFor(() => expect(page.textContent).toContain('Ash Golem'));
        expect(button(page, 'Import picks')).toBeUndefined();
      });

      it('lists the problems of a file that is no longer valid', async () => {
        const { page } = await previewed();

        await confirmImport(
          page,
          {
            error: 'invalid-pick-import',
            message: 'This file can’t be imported.',
            problems: ['The file has 2 player columns, but the draft has 3 players.'],
          },
          422,
        );

        await vi.waitFor(() => {
          const problems = [...page.querySelectorAll('.pick-import-problems li')];
          expect(problems.map((li) => li.textContent)).toEqual([
            'The file has 2 player columns, but the draft has 3 players.',
          ]);
        });
        expect(page.querySelector('.pick-import-preview')).toBeNull();
      });
    });

    it('lists every problem with an invalid file', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, { players: [alicePlayer, bob] });

      await chooseFile(
        fixture,
        page,
        {
          error: 'invalid-pick-import',
          message: 'This file can’t be imported.',
          problems: [
            'Unknown Card isn’t in this draft’s pool.',
            'Ash Golem appears more than once.',
          ],
        },
        422,
      );

      await vi.waitFor(() => {
        const problems = [...page.querySelectorAll('.pick-import-problems li')];
        expect(problems.map((li) => li.textContent)).toEqual([
          'Unknown Card isn’t in this draft’s pool.',
          'Ash Golem appears more than once.',
        ]);
      });
    });

    it('says a file is too large, whoever refused it', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, { players: [alicePlayer, bob] });

      await chooseFile(fixture, page, { message: 'request entity too large' }, 413);

      await vi.waitFor(() =>
        expect(page.querySelector('[role="alert"]')?.textContent).toContain(
          'That file is too large to be a sheet of picks.',
        ),
      );
    });

    it('drops a preview when the draft changes, as its pairings may no longer hold', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, { players: [alicePlayer, bob] });
      await chooseFile(fixture, page, preview);
      await shownPreview(page);

      updates.events.next({
        type: 'changed',
        draft: draft({ players: [bob, alicePlayer], version: 1 }),
      });
      // Alice is a player, so her queue is re-read too.
      await flushQueue(EMPTY_QUEUE);
      await fixture.whenStable();

      expect(page.querySelector('.pick-import-preview')).toBeNull();
    });

    it('is offered only to the organizer or an app admin', async () => {
      const { page } = await openDraft(
        completeSnapshot,
        { players: [alicePlayer, bob] },
        { user: { ...alice, id: 'carol', isAdmin: false } },
      );

      expect(page.textContent).not.toContain('Import picks');
      expect(page.querySelector('input[type="file"]')).toBeNull();
    });

    it('is held until the pool snapshot is complete', async () => {
      const { page } = await openDraft(
        { state: 'Failed', cards: 0, total: null, error: 'Scryfall is down' },
        { players: [alicePlayer, bob] },
      );

      expect(button(page, 'Import picks')!.disabled).toBe(true);
    });

    it('is gone once the draft has started', async () => {
      const { page } = await openDraft(completeSnapshot, {
        state: 'Drafting',
        players: [alicePlayer, bob],
        turn: { pick: 1, round: 1, playerId: alice.id },
      });

      expect(button(page, 'Import picks')).toBeUndefined();
    });
  });

  it('holds the start until the pool snapshot is complete', async () => {
    // Not openDraft: the snapshot's poll is due before the page settles.
    const { fixture, page } = await openUrl('/drafts/draft-1');
    http.expectOne('/api/drafts/draft-1').flush(
      draft({
        snapshot: { state: 'Running', cards: 175, total: 540 },
        players: [alicePlayer, bob],
      }),
    );
    await flushQueue(EMPTY_QUEUE);
    TestBed.tick();

    expect(button(page, 'Start draft')?.disabled).toBe(true);
    expect(section(page, 'Players').textContent).toContain(
      'You can start the draft once the pool snapshot is complete.',
    );

    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(
      draft({ players: [alicePlayer, bob] }),
    );
    await flushPool();
    await fixture.whenStable();
    expect(button(page, 'Start draft')?.disabled).toBe(false);
    expect(section(page, 'Players').textContent).not.toContain('You can start the draft once');
  });

  it('offers seat changes and the start only to the organizer or an app admin', async () => {
    const { page } = await openDraft(completeSnapshot, {
      players: [alicePlayer, bob],
      organizer: { id: bob.id, name: bob.name },
    });

    expect(button(page, 'Start draft')).toBeUndefined();
    expect(button(page, 'Randomize seats')).toBeUndefined();
    expect(button(page, 'Move Bob earlier')).toBeUndefined();
  });
});
