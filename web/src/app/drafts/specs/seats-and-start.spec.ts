import type { PickImportRefusal, StartRefusal } from 'contract';
import { TestBed } from '@angular/core/testing';
import {
  useDraftsApp,
  alertIn,
  alice,
  draft,
  http,
  updates,
  openUrl,
  panelSeatNames,
  panelTurnSeat,
  playersPanel,
  bob,
  alicePlayer,
  openDraft,
  flushQueueAndPlan,
  flushPicks,
  flushPool,
  completeSnapshot,
  button,
  pickOf,
  poolCardOf,
  tabButton,
  panel,
  pickImportPreview,
  pickImportProblems,
  serverError,
  type AppFixture,
  ORGANIZE_ONLY,
  powersAnswer,
  buttonOrder,
  ALL_POWERS,
  drafting,
  findPlayersBesideTabs,
  viewOn,
} from './harness';
import { disclosure } from './disclosure-harness';
import { playersButton, playersSheet } from './seat-strip-harness';
import { clickOn } from '../../specs-harness';

useDraftsApp();

const START_FAILED = "Couldn't start the draft.";

describe('seats and start', () => {
  beforeEach(() => powersAnswer(ORGANIZE_ONLY));

  it('shows the seat order and whose turn it is', async () => {
    const { page } = await openDraft(completeSnapshot, {
      state: 'Drafting',
      players: [bob, alicePlayer],
      turn: { pick: 1, round: 1, playerId: bob.id },
    });

    clickOn(playersButton(page));
    const sheet = playersSheet()!;

    expect(panelSeatNames(sheet)).toEqual(['Bob', 'Alice']);
    expect(page.textContent).toContain('Bob’s turn: pick 1, round 1');
    expect(panelTurnSeat(sheet)?.textContent).toContain('Bob');
  });

  it('keeps the seat order in the Players panel once the draft is closed, on mobile, closed', async () => {
    viewOn('mobile');
    onTestFinished(() => {
      vi.unstubAllGlobals();
    });
    const { page } = await openDraft(
      completeSnapshot,
      drafting({ players: [bob, alicePlayer], state: 'Closed', turn: null }),
    );

    expect(disclosure(page, 'Players · 2')!.open).toBe(false);
    expect(panelSeatNames(page)).toEqual(['Bob', 'Alice']);
  });

  it('tells the signed-in player when it is their turn', async () => {
    const { page } = await openDraft(completeSnapshot, {
      state: 'Drafting',
      players: [alicePlayer, bob],
      turn: { pick: 1, round: 1, playerId: alice.id },
    });

    expect(page.textContent).toContain('Your turn: pick 1, round 1');
  });

  it('names a turn whose player is no longer among the players as another player’s', async () => {
    const { page } = await openDraft(completeSnapshot, {
      state: 'Drafting',
      players: [alicePlayer, bob],
      turn: { pick: 1, round: 1, playerId: 'gone' },
    });

    expect(page.textContent?.replace(/\s+/g, ' ')).toContain(
      'Another player’s turn: pick 1, round 1',
    );
  });

  it('offers a joined organizer Leave, More, then Start draft in the header, and Randomize seats then Import picks beside the seats', async () => {
    const { page } = await openDraft(completeSnapshot, { players: [alicePlayer, bob] });

    expect(buttonOrder(page, 'Start draft')).toEqual(['Leave', 'More', 'Start draft']);
    expect(buttonOrder(playersPanel(page), 'Randomize seats')).toEqual([
      'Randomize seats',
      'Import picks',
    ]);
  });

  it('lets the organizer randomize the seats', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, { players: [alicePlayer, bob] });

    button(page, 'Randomize seats')!.click();
    const req = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/seats/randomize'));
    expect(req.request.method).toBe('POST');
    req.flush(draft({ players: [bob, alicePlayer] }));
    await fixture.whenStable();

    expect(panelSeatNames(page)).toEqual(['Bob', 'Alice']);
  });

  describe('with the Players panel beside the tabs, on a desktop', () => {
    beforeEach(() => viewOn('desktop'));
    afterEach(() => vi.unstubAllGlobals());

    it('lets the organizer randomize the seats from it', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, { players: [alicePlayer, bob] });

      button(findPlayersBesideTabs(page)!, 'Randomize seats')!.click();
      const req = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/seats/randomize'));
      expect(req.request.method).toBe('POST');
      req.flush(draft({ players: [bob, alicePlayer] }));
      await fixture.whenStable();

      expect(panelSeatNames(page)).toEqual(['Bob', 'Alice']);
    });

    it('keeps the seat order there, open, once the draft is closed', async () => {
      const { page } = await openDraft(
        completeSnapshot,
        drafting({ players: [bob, alicePlayer], state: 'Closed', turn: null }),
      );

      expect(disclosure(findPlayersBesideTabs(page)!, 'Players · 2')!.open).toBe(true);
      expect(panelSeatNames(page)).toEqual(['Bob', 'Alice']);
    });
  });

  it('lets the organizer move a seat earlier or later', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, { players: [alicePlayer, bob] });
    expect(button(page, 'Move Alice earlier')?.disabled).toBe(true);
    expect(button(page, 'Move Bob later')?.disabled).toBe(true);

    button(page, 'Move Bob earlier')!.click();
    const req = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/seats'));
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ playerIds: [bob.id, alice.id] });
    req.flush(draft({ players: [bob, alicePlayer] }));
    await fixture.whenStable();

    expect(panelSeatNames(page)).toEqual(['Bob', 'Alice']);
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
      { error: 'pool-too-small', message } satisfies StartRefusal,
      { status: 409, statusText: 'Conflict' },
    );
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(
      draft({ players: [alicePlayer, bob] }),
    );
    await fixture.whenStable();

    expect(page.querySelector('[role="alert"]')?.textContent).toContain(message);
    expect(button(page, 'Start draft')).toBeDefined();
  });

  it('says the start failed when it fails without a refusal', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, { players: [alicePlayer, bob] });

    button(page, 'Start draft')!.click();
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/start'))).flush(null, serverError);
    await fixture.whenStable();

    await vi.waitFor(() => expect(alertIn(page)?.textContent).toContain(START_FAILED));
  });

  describe('pick import', () => {
    const text = ',Ann,Ben,\n->,Ash Golem,,';
    const readFailed = "Couldn't read the file.";
    const importFailed = "Couldn't import the picks.";

    /** The hidden file input that Import picks opens the file picker for. */
    const fileInput = (page: HTMLElement) =>
      page.querySelector<HTMLInputElement>('input[type="file"][aria-label="Import picks"]')!;
    /** The page's catch-up re-reads of the draft, taken so none is left to answer; none if it sent none. */
    const catchUps = () => http.match({ url: '/api/drafts/draft-1', method: 'GET' });

    /** Chooses a made-up file and answers its preview with `answer`. */
    async function chooseFile(
      fixture: AppFixture,
      page: HTMLElement,
      answer: object,
      status = 200,
    ) {
      const input = fileInput(page);
      Object.defineProperty(input, 'files', {
        configurable: true,
        value: [new File([text], 'picks.csv', { type: 'text/csv' })],
      });
      // jsdom's file input doesn't take its value from `files`, so it is kept here.
      let value = 'C:\\fakepath\\picks.csv';
      Object.defineProperty(input, 'value', {
        configurable: true,
        get: () => value,
        set: (emptied: string) => {
          value = emptied;
        },
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
        const shown = pickImportPreview(page);
        if (!shown) throw new Error('No preview yet');
        return shown;
      });

    const preview = {
      seats: [
        { column: 'Ann', playerId: alice.id, player: 'Alice' },
        { column: 'Ben', playerId: bob.id, player: 'Bob' },
      ],
      picks: 70,
      next: { pick: 71, player: 'Bob' },
    };

    describe('from the Players panel beside the tabs, on a desktop', () => {
      beforeEach(() => viewOn('desktop'));
      afterEach(() => vi.unstubAllGlobals());

      it('previews a file chosen there, showing the preview there', async () => {
        const { fixture, page } = await openDraft(completeSnapshot, {
          players: [alicePlayer, bob],
        });
        const besideTabs = findPlayersBesideTabs(page)!;

        await chooseFile(fixture, besideTabs, preview);

        const shown = await shownPreview(page);
        expect(besideTabs.contains(shown)).toBe(true);
        expect(shown.textContent).toContain('Ann → Alice');
      });

      it('lists every problem with an invalid file there', async () => {
        const { fixture, page } = await openDraft(completeSnapshot, {
          players: [alicePlayer, bob],
        });
        const besideTabs = findPlayersBesideTabs(page)!;

        await chooseFile(
          fixture,
          besideTabs,
          {
            error: 'invalid-pick-import',
            message: 'This file can’t be imported.',
            problems: ['Unknown Card isn’t in this draft’s pool.'],
          } satisfies PickImportRefusal,
          422,
        );

        await vi.waitFor(() =>
          expect(pickImportProblems(besideTabs)).toEqual([
            'Unknown Card isn’t in this draft’s pool.',
          ]),
        );
      });
    });

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
        expect(req.request.body).toEqual({ csv: text, playerIds: [alice.id, bob.id] });
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
          expect(pickImportPreview(page)).toBeUndefined();
          expect(button(page, 'Import picks')).toBeUndefined();
        });
        const picks = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/picks'));
        picks.flush([]);
        await flushQueueAndPlan();
        await fixture.whenStable();
      });

      it('moves a viewer in the lobby to the paused draft and its picks without a reload', async () => {
        const { fixture, page } = await openDraft(
          completeSnapshot,
          { players: [alicePlayer, bob] },
          { cards: [poolCardOf('ash-golem', 'Ash Golem')] },
        );

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
        picks.flush([pickOf({ poolCardId: 'ash-golem-card' })]);
        await flushQueueAndPlan();
        await fixture.whenStable();

        tabButton(page, 'Board').click();
        await vi.waitFor(() => {
          TestBed.tick();
          expect(panel(page).textContent).toContain('Ash Golem');
        });
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
          } satisfies PickImportRefusal,
          422,
        );

        await vi.waitFor(() =>
          expect(pickImportProblems(page)).toEqual([
            'The file has 2 player columns, but the draft has 3 players.',
          ]),
        );
        expect(pickImportPreview(page)).toBeUndefined();
      });

      it('says the import failed when it fails without a refusal, keeping the preview, until it goes through', async () => {
        const { fixture, page } = await previewed();

        await confirmImport(page, { message: 'Internal server error' }, 500);
        await fixture.whenStable();
        await vi.waitFor(() => expect(alertIn(page)?.textContent).toContain(importFailed));
        expect(pickImportPreview(page)).toBeDefined();
        expect(catchUps()).toEqual([]);

        await confirmImport(
          page,
          draft({
            state: 'Paused',
            players: [alicePlayer, bob],
            turn: { pick: 2, round: 1, playerId: bob.id },
            version: 1,
          }),
        );
        await flushPicks([]);
        await flushQueueAndPlan();
        await fixture.whenStable();
        await vi.waitFor(() => expect(button(page, 'Import picks')).toBeUndefined());
        expect(page.textContent).not.toContain(importFailed);
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
        } satisfies PickImportRefusal,
        422,
      );

      await vi.waitFor(() =>
        expect(pickImportProblems(page)).toEqual([
          'Unknown Card isn’t in this draft’s pool.',
          'Ash Golem appears more than once.',
        ]),
      );
    });

    it('drops the problems with a file once a valid one is chosen', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, { players: [alicePlayer, bob] });
      await chooseFile(
        fixture,
        page,
        {
          error: 'invalid-pick-import',
          message: 'This file can’t be imported.',
          problems: ['Ash Golem appears more than once.'],
        } satisfies PickImportRefusal,
        422,
      );
      await vi.waitFor(() => expect(pickImportProblems(page)).toHaveLength(1));

      await chooseFile(fixture, page, preview);
      await shownPreview(page);

      expect(pickImportProblems(page)).toEqual([]);
    });

    it('opens the file picker on Import picks, unless another change is in flight', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, { players: [alicePlayer, bob] });
      const filePicker = vi.spyOn(fileInput(page), 'click');

      button(page, 'Import picks')!.click();
      expect(filePicker).toHaveBeenCalledTimes(1);

      button(page, 'Start draft')!.click();
      const start = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/start'));
      button(page, 'Import picks')!.click();
      expect(filePicker).toHaveBeenCalledTimes(1);
      start.flush(null, serverError);
      await fixture.whenStable();
    });

    it('forgets an earlier failure once a file is previewed', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, { players: [alicePlayer, bob] });
      button(page, 'Start draft')!.click();
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/start'))).flush(
        null,
        serverError,
      );
      await fixture.whenStable();
      await vi.waitFor(() => expect(alertIn(page)?.textContent).toContain(START_FAILED));

      await chooseFile(fixture, page, preview);
      await shownPreview(page);

      expect(alertIn(page)).toBeNull();
    });

    it('says a file couldn’t be read when its preview fails without a refusal, and doesn’t catch up', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, { players: [alicePlayer, bob] });

      await chooseFile(fixture, page, { message: 'Internal server error' }, 500);

      await vi.waitFor(() => expect(alertIn(page)?.textContent).toContain(readFailed));
      expect(catchUps()).toEqual([]);
    });

    it('empties the file chosen once previewed, so choosing the same file again previews it again', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, { players: [alicePlayer, bob] });

      await chooseFile(fixture, page, preview);
      await shownPreview(page);

      expect(fileInput(page).value).toBe('');
    });

    it('keeps a preview when the draft is read again unchanged, as on reconnecting', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, { players: [alicePlayer, bob] });
      await chooseFile(fixture, page, preview);
      await shownPreview(page);

      updates.events.next({ type: 'changed', draft: draft({ players: [alicePlayer, bob] }) });
      await fixture.whenStable();

      expect(pickImportPreview(page)).toBeDefined();
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
      await flushQueueAndPlan();
      await fixture.whenStable();

      expect(pickImportPreview(page)).toBeUndefined();
    });

    it('is offered only to a viewer who may organize', async () => {
      const { page } = await openDraft(
        completeSnapshot,
        { players: [alicePlayer, bob] },
        { powers: { ...ALL_POWERS, organize: false } },
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
    await flushQueueAndPlan();
    TestBed.tick();

    expect(button(page, 'Start draft')?.disabled).toBe(true);
    expect(page.textContent).toContain(
      'You can start the draft once the pool snapshot is complete.',
    );

    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(
      draft({ players: [alicePlayer, bob] }),
    );
    await flushPool();
    await fixture.whenStable();
    expect(button(page, 'Start draft')?.disabled).toBe(false);
    expect(page.textContent).not.toContain('You can start the draft once');
  });

  it('offers seat changes and the start only to a viewer who may organize', async () => {
    const { page } = await openDraft(
      completeSnapshot,
      { players: [alicePlayer, bob] },
      { powers: { ...ALL_POWERS, organize: false } },
    );

    expect(button(page, 'Start draft')).toBeUndefined();
    expect(button(page, 'Randomize seats')).toBeUndefined();
    expect(button(page, 'Move Bob earlier')).toBeUndefined();
  });
});
