import { type DraftView, type PickView } from '../drafts';
import {
  useDraftsApp,
  alice,
  draft,
  http,
  bob,
  alicePlayer,
  tabButton,
  openDraft,
  flushPicks,
} from './harness';
import {
  useTallScreen,
  complete,
  shivan,
  brightclimb,
  tiles,
  openDetail,
  buttonIn,
} from './pool-tab-harness';

useDraftsApp();
useTallScreen();

describe('pool tab', () => {
  describe('picking', () => {
    /** Started, with Alice then Bob; Alice is up unless told otherwise. */
    const drafting = (fields: Partial<DraftView> = {}): Partial<DraftView> => ({
      state: 'Drafting',
      players: [alicePlayer, bob],
      turn: { pick: 1, round: 1, playerId: alice.id },
      ...fields,
    });
    const shivanPick: PickView = {
      pick: 1,
      playerId: alice.id,
      oracleId: 'shivan-oracle',
      name: 'Shivan Dragon',
      layout: 'normal',
      set: 'ima',
      collectorNumber: '1',
    };

    it('lets the player whose turn it is pick a card from its detail', async () => {
      const { fixture, page } = await openDraft(complete, drafting(), {
        cards: [brightclimb, shivan],
      });

      const detail = await openDetail(fixture, page, 1);
      buttonIn(detail, 'Pick')!.click();
      const req = http.expectOne('/api/drafts/draft-1/picks');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ oracleId: 'shivan-oracle' });
      req.flush(draft(drafting({ turn: { pick: 2, round: 1, playerId: bob.id } })));
      await flushPicks([shivanPick]);
      await fixture.whenStable();

      expect(page.querySelector('[role="dialog"]')).toBeNull();
      expect(page.textContent).toContain('Bob’s turn: pick 2, round 1');
      expect(tiles(page)[1].classList).toContain('picked');
      expect(tiles(page)[1].textContent).toContain('Picked');
      expect(tiles(page)[0].classList).not.toContain('picked');
    });

    it('disables Pick when it is not your turn', async () => {
      const { fixture, page } = await openDraft(
        complete,
        drafting({ turn: { pick: 1, round: 1, playerId: bob.id } }),
        { cards: [shivan] },
      );

      const detail = await openDetail(fixture, page, 0);

      expect(buttonIn(detail, 'Pick')!.disabled).toBe(true);
      expect(detail.textContent).toContain('You can pick on your turn.');
    });

    it('disables Pick for a card that has been picked', async () => {
      const { fixture, page } = await openDraft(
        complete,
        drafting({ turn: { pick: 2, round: 1, playerId: alice.id } }),
        { cards: [brightclimb, shivan], picks: [{ ...shivanPick, playerId: bob.id }] },
      );

      expect(tiles(page)[1].textContent).toContain('Picked');
      const detail = await openDetail(fixture, page, 1);
      expect(buttonIn(detail, 'Pick')!.disabled).toBe(true);
      expect(detail.textContent).toContain('Already picked.');
    });

    it('offers no Pick to someone who is not a player', async () => {
      const { fixture, page } = await openDraft(complete, drafting({ players: [bob] }), {
        cards: [shivan],
      });

      expect(buttonIn(await openDetail(fixture, page, 0), 'Pick')).toBeUndefined();
    });

    it('offers no Pick before the draft starts', async () => {
      const { fixture, page } = await openDraft(
        complete,
        { players: [alicePlayer, bob] },
        { cards: [shivan] },
      );

      expect(buttonIn(await openDetail(fixture, page, 0), 'Pick')).toBeUndefined();
    });

    it('says why a pick was refused, and catches up with the draft', async () => {
      const { fixture, page } = await openDraft(complete, drafting(), { cards: [shivan] });

      const detail = await openDetail(fixture, page, 0);
      buttonIn(detail, 'Pick')!.click();
      http
        .expectOne('/api/drafts/draft-1/picks')
        .flush(
          { error: 'not-your-turn', message: 'It’s not your turn.' },
          { status: 409, statusText: 'Conflict' },
        );
      // The page re-reads the draft and its picks to catch up.
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(
        draft(drafting({ turn: { pick: 2, round: 1, playerId: bob.id } })),
      );
      await flushPicks([{ ...shivanPick, oracleId: 'other-oracle', name: 'Other' }]);
      await fixture.whenStable();

      expect(detail.querySelector('[role="alert"]')?.textContent).toContain('It’s not your turn.');
      expect(page.textContent).toContain('Bob’s turn: pick 2, round 1');
    });
  });

  it('offers no picks or queue changes on a card, but keeps the exports', async () => {
    const { fixture, page } = await openDraft(
      complete,
      {
        state: 'Closed',
        players: [alicePlayer, bob],
        turn: null,
      },
      {
        cards: [brightclimb],
        picks: [
          {
            pick: 1,
            playerId: alice.id,
            oracleId: brightclimb.oracleId,
            name: brightclimb.name,
            layout: 'normal',
            set: brightclimb.set,
            collectorNumber: brightclimb.collectorNumber,
          },
        ],
      },
    );

    const detail = await openDetail(fixture, page, 0);
    expect(buttonIn(detail, 'Add to queue')).toBeUndefined();
    expect(buttonIn(detail, 'Pick')).toBeUndefined();
    buttonIn(detail, 'Close')!.click();
    await fixture.whenStable();

    tabButton(page, 'Me').click();
    await fixture.whenStable();
    expect(buttonIn(page, 'Copy for Arena')).toBeDefined();
    expect(buttonIn(page, 'Copy for Moxfield')).toBeDefined();
  });
});
