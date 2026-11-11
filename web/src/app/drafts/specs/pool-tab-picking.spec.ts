import { TestBed } from '@angular/core/testing';
import type { PickRefusal, PickView } from 'contract';
import {
  useDraftsApp,
  alice,
  draft,
  http,
  updates,
  bob,
  alicePlayer,
  openDraft,
  flushPicks,
  flushQueueAndPlan,
  completeSnapshot,
  button,
  type DraftFixture,
  pickOf,
  drafting,
  openUrl,
  flushPool,
  panel,
  statusMessage,
  controlByLabel,
  type AppFixture,
  text,
  alertIn,
  serverError,
} from './harness';
import { openDialog } from '../../specs-harness';
import {
  useTallScreen,
  card,
  shivan,
  brightclimb,
  tiles,
  openDetail,
  searchBox,
} from './pool-tab-harness';
import { openPlan } from './plan-tab-harness';

useDraftsApp();
useTallScreen();

describe('pool tab', () => {
  describe('picking', () => {
    /** What a failed pick says when the API gives no reason. */
    const pickFailed = "Couldn't make the pick. Try again in a moment.";
    /** Alice's turn, on the draft's first pick: she is up unless told otherwise. */
    const alicesTurn = { pick: 1, round: 1, playerId: alice.id };
    const shivanPick: PickView = pickOf({
      poolCardId: 'shivan-card',
    });

    it('lets the player whose turn it is pick a card from its detail', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: alicesTurn }), {
        cards: [brightclimb, shivan],
      });

      const detail = await openDetail(fixture, page, 1);
      button(detail, 'Pick')!.click();
      const req = http.expectOne('/api/drafts/draft-1/picks');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ poolCardId: 'shivan-card' });
      req.flush(draft(drafting({ turn: { pick: 2, round: 1, playerId: bob.id } })));
      await flushPicks([shivanPick]);
      await fixture.whenStable();

      expect(openDialog()).toBeNull();
      expect(page.textContent).toContain('Bob’s turn: pick 2, round 1');
      expect(tiles(page)[1].classList).toContain('picked');
      expect(tiles(page)[1].textContent).toContain('Picked');
      expect(tiles(page)[0].classList).not.toContain('picked');
    });

    /** Picks Shivan Dragon from its Card detail, opened from its focused tile, and answers the pick. */
    async function pickFromTile(fixture: AppFixture, page: HTMLElement) {
      tiles(page)[1].focus();
      button(await openDetail(fixture, page, 1), 'Pick')!.click();
      http
        .expectOne('/api/drafts/draft-1/picks')
        .flush(draft(drafting({ turn: { pick: 2, round: 1, playerId: bob.id } })));
      await flushPicks([shivanPick]);
      await fixture.whenStable();
    }

    it('returns focus to the picked card’s tile once its Card detail closes', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: alicesTurn }), {
        cards: [brightclimb, shivan],
      });

      await pickFromTile(fixture, page);

      expect(openDialog()).toBeNull();
      expect(document.activeElement).toBe(tiles(page)[1]);
    });

    it('returns focus to the pool search box when the picked card is hidden', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: alicesTurn }), {
        cards: [brightclimb, shivan],
      });
      controlByLabel(page, 'checkbox', 'Hide picked')!.click();
      await fixture.whenStable();

      await pickFromTile(fixture, page);

      expect(tiles(page)).toHaveLength(1);
      expect(document.activeElement).toBe(searchBox(page));
    });

    it('disables Pick when it is not your turn', async () => {
      const { fixture, page } = await openDraft(
        completeSnapshot,
        drafting({ turn: { pick: 1, round: 1, playerId: bob.id } }),
        { cards: [shivan] },
      );

      const detail = await openDetail(fixture, page, 0);

      expect(button(detail, 'Pick')!.disabled).toBe(true);
      expect(detail.textContent).toContain('You can pick on your turn.');
    });

    it('disables Pick for a card that has been picked', async () => {
      const { fixture, page } = await openDraft(
        completeSnapshot,
        drafting({ turn: { pick: 2, round: 1, playerId: alice.id } }),
        { cards: [brightclimb, shivan], picks: [{ ...shivanPick, playerId: bob.id }] },
      );

      expect(tiles(page)[1].textContent).toContain('Picked');
      const detail = await openDetail(fixture, page, 1);
      expect(button(detail, 'Pick')!.disabled).toBe(true);
      expect(detail.textContent).toContain('Picked by Bob');
    });

    describe('when the pick log fails to load', () => {
      const failPicks = async () =>
        (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/picks'))).flush(null, {
          status: 503,
          statusText: 'Service Unavailable',
        });
      const alicesTurnAgain = drafting({ turn: { pick: 2, round: 1, playerId: alice.id } });
      const picksDidntLoad = "Couldn't load the latest picks. You can pick once they load.";

      /** Opens Alice's turn with Shivan picked by Bob, then has the pick log's re-read fail. */
      async function openWithFailedReRead() {
        const opened = await openDraft(completeSnapshot, alicesTurnAgain, {
          cards: [brightclimb, shivan],
          picks: [{ ...shivanPick, playerId: bob.id }],
        });
        updates.events.next({ type: 'changed', draft: draft({ ...alicesTurnAgain, version: 1 }) });
        await failPicks();
        await flushQueueAndPlan();
        await opened.fixture.whenStable();
        return opened;
      }

      it('keeps the picked badges it had when a re-read fails', async () => {
        const { fixture, page } = await openWithFailedReRead();

        expect(tiles(page)[1].textContent).toContain('Picked');
        const detail = await openDetail(fixture, page, 1);
        expect(button(detail, 'Pick')!.disabled).toBe(true);
        expect(detail.textContent).toContain('Picked by Bob');
      });

      it('offers no card as available to pick when a re-read fails, as one may have been picked since', async () => {
        const { fixture, page } = await openWithFailedReRead();

        expect(tiles(page)[0].textContent).not.toContain('Picked');
        const detail = await openDetail(fixture, page, 0);
        expect(button(detail, 'Pick')!.disabled).toBe(true);
        expect(statusMessage(detail, picksDidntLoad)).toBeDefined();
      });

      it('offers Pick again once a later re-read loads the pick log', async () => {
        const { fixture, page } = await openWithFailedReRead();

        updates.events.next({ type: 'connected' });
        (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(
          draft({ ...alicesTurnAgain, version: 1 }),
        );
        await flushPicks([{ ...shivanPick, playerId: bob.id }]);
        await fixture.whenStable();

        const detail = await openDetail(fixture, page, 0);
        expect(button(detail, 'Pick')!.disabled).toBe(false);
        expect(statusMessage(detail, picksDidntLoad)).toBeUndefined();
      });

      it('says so, and offers no card as available to pick, when the first load fails', async () => {
        const { fixture, page } = await openUrl('/drafts/draft-1');
        http.expectOne('/api/drafts/draft-1').flush(draft({ ...alicesTurnAgain }));
        await flushPool([brightclimb, shivan]);
        await failPicks();
        await flushQueueAndPlan();
        await fixture.whenStable();

        expect(panel(page).textContent).toContain(
          "Couldn't load the picks. Try reloading the page.",
        );
        const detail = await openDetail(fixture, page, 1);
        expect(button(detail, 'Pick')!.disabled).toBe(true);
        expect(statusMessage(detail, picksDidntLoad)).toBeDefined();
      });
    });

    it('shows a tile per copy of a card, each picked and badged on its own', async () => {
      const copies = ['shivan-1', 'shivan-2', 'shivan-3'].map((id) => card({ id }));
      const { fixture, page } = await openDraft(
        completeSnapshot,
        drafting({ turn: { pick: 2, round: 1, playerId: alice.id } }),
        { cards: copies, picks: [{ ...shivanPick, poolCardId: 'shivan-2', playerId: bob.id }] },
      );

      expect(tiles(page).map((tile) => tile.classList.contains('picked'))).toEqual([
        false,
        true,
        false,
      ]);
      const detail = await openDetail(fixture, page, 2);
      expect(button(detail, 'Pick')!.disabled).toBe(false);
      button(detail, 'Pick')!.click();
      expect(http.expectOne('/api/drafts/draft-1/picks').request.body).toEqual({
        poolCardId: 'shivan-3',
      });
    });

    it('offers no Pick to someone who is not a player, as the api refuses with `not-a-player`', async () => {
      const { fixture, page } = await openDraft(
        completeSnapshot,
        drafting({ turn: alicesTurn, players: [bob] }),
        {
          cards: [shivan],
        },
      );

      expect(button(await openDetail(fixture, page, 0), 'Pick')).toBeUndefined();
    });

    it.each([
      ['in the lobby', { players: [alicePlayer, bob] }],
      ['while paused', drafting({ state: 'Paused', turn: alicesTurn })],
      ['once the draft is Complete', drafting({ state: 'Complete', turn: null })],
      ['once the draft is Closed', drafting({ state: 'Closed', turn: null })],
    ])('offers no Pick %s, as the api refuses with `not-drafting`', async (_, fields) => {
      const { fixture, page } = await openDraft(completeSnapshot, fields, { cards: [shivan] });

      expect(button(await openDetail(fixture, page, 0), 'Pick')).toBeUndefined();
    });

    it('says why a pick was refused, and catches up with the draft', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: alicesTurn }), {
        cards: [shivan],
      });

      const detail = await openDetail(fixture, page, 0);
      button(detail, 'Pick')!.click();
      http
        .expectOne('/api/drafts/draft-1/picks')
        .flush({ error: 'not-your-turn', message: 'It’s not your turn.' } satisfies PickRefusal, {
          status: 409,
          statusText: 'Conflict',
        });
      // The page re-reads the draft and its picks to catch up.
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(
        draft(drafting({ turn: { pick: 2, round: 1, playerId: bob.id } })),
      );
      await flushPicks([{ ...shivanPick, poolCardId: 'other-card' }]);
      await fixture.whenStable();

      expect(text(alertIn(detail))).toContain('It’s not your turn.');
      expect(page.textContent).toContain('Bob’s turn: pick 2, round 1');
    });

    it('says the pick failed when a refusal gives no reason', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: alicesTurn }), {
        cards: [shivan],
      });

      const detail = await openDetail(fixture, page, 0);
      button(detail, 'Pick')!.click();
      http
        .expectOne('/api/drafts/draft-1/picks')
        .flush(null, { status: 409, statusText: 'Conflict' });
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(
        draft(drafting({ turn: { pick: 2, round: 1, playerId: bob.id } })),
      );
      await flushPicks([{ ...shivanPick, poolCardId: 'other-card' }]);
      await fixture.whenStable();

      expect(text(alertIn(detail))).toContain(pickFailed);
    });

    it('shows Picking… while a pick is on its way, and says when it fails for a reason other than a refusal, until it is tried again', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: alicesTurn }), {
        cards: [shivan],
      });
      const detail = await openDetail(fixture, page, 0);

      button(detail, 'Pick')!.click();
      TestBed.tick();
      expect(button(detail, 'Pick')).toBeUndefined();
      expect(button(detail, 'Picking…')!.disabled).toBe(true);
      // Not a refusal, so its message isn't the pick's to show.
      http
        .expectOne('/api/drafts/draft-1/picks')
        .flush({ error: 'internal', message: 'Something went wrong.' }, serverError);
      await vi.waitFor(() => expect(text(alertIn(detail))).toContain(pickFailed));
      expect(button(detail, 'Pick')!.disabled).toBe(false);

      button(detail, 'Pick')!.click();
      TestBed.tick();
      expect(alertIn(detail)).toBeNull();
      http
        .expectOne('/api/drafts/draft-1/picks')
        .flush(draft(drafting({ turn: { pick: 2, round: 1, playerId: bob.id } })));
      await flushPicks([shivanPick]);
      await fixture.whenStable();
      expect(openDialog()).toBeNull();
    });

    describe('made from a Card detail since closed', () => {
      /** Opens Shivan Dragon's Card detail, picks it, closes it, and opens Brightclimb's. */
      async function pickThenOpenAnother() {
        const opened = await openDraft(completeSnapshot, drafting({ turn: alicesTurn }), {
          cards: [brightclimb, shivan],
        });
        button(await openDetail(opened.fixture, opened.page, 1), 'Pick')!.click();
        button(openDialog()!, 'Close')!.click();
        const other = await openDetail(opened.fixture, opened.page, 0);
        return { ...opened, other, pick: http.expectOne('/api/drafts/draft-1/picks') };
      }

      /** Waits until `detail` no longer says a pick is on its way. */
      async function answered(detail: HTMLElement) {
        await vi.waitFor(() => {
          TestBed.tick();
          expect(button(detail, 'Pick')).toBeDefined();
        });
      }

      it('does not close the Card detail now open once it succeeds, and the card is picked', async () => {
        const { fixture, page, other, pick } = await pickThenOpenAnother();

        pick.flush(draft(drafting({ turn: { pick: 2, round: 1, playerId: bob.id } })));
        await flushPicks([shivanPick]);
        await fixture.whenStable();
        await answered(other);

        expect(openDialog()?.getAttribute('aria-label')).toBe(brightclimb.name);
        expect(alertIn(other)).toBeNull();
        expect(button(other, 'Pick')!.disabled).toBe(true);
        expect(tiles(page)[1].textContent).toContain('Picked');
      });

      it('shows no refusal in the Card detail now open', async () => {
        const { fixture, other, pick } = await pickThenOpenAnother();

        pick.flush(
          { error: 'not-your-turn', message: 'It’s not your turn.' } satisfies PickRefusal,
          {
            status: 409,
            statusText: 'Conflict',
          },
        );
        (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(
          draft(drafting({ turn: { pick: 2, round: 1, playerId: bob.id } })),
        );
        await flushPicks([]);
        await fixture.whenStable();
        await answered(other);

        expect(openDialog()?.getAttribute('aria-label')).toBe(brightclimb.name);
        expect(alertIn(other)).toBeNull();
      });
    });
  });

  describe('who picked a card', () => {
    /** Bob is up, on the draft's second pick. */
    const bobUp = drafting({ turn: { pick: 2, round: 1, playerId: bob.id } });
    const pickBy = (playerId: string): PickView =>
      pickOf({
        playerId,
        poolCardId: 'shivan-card',
      });
    const openPicked = (playerId: string, fields: DraftFixture = {}) =>
      openDraft(
        completeSnapshot,
        { ...bobUp, ...fields },
        { cards: [shivan], picks: [pickBy(playerId)] },
      );
    const badge = (page: HTMLElement) => tiles(page)[0].querySelector<HTMLElement>('.badge')!;
    const avatar = (root: HTMLElement) => root.querySelector<HTMLImageElement>('img.avatar');
    /** What a screen reader reads out of `element`: its text, leaving out what's hidden from it. */
    const announced = (element: HTMLElement) => {
      const copy = element.cloneNode(true) as HTMLElement;
      copy.querySelectorAll('[aria-hidden="true"]').forEach((hidden) => hidden.remove());
      return copy.textContent?.trim();
    };

    it('shows the avatar of the player who picked a card above the word Picked', async () => {
      const { page } = await openPicked(bob.id);

      const shown = avatar(badge(page))!;
      expect(shown.getAttribute('src')).toBe(bob.avatarUrl);
      expect(shown.getAttribute('width')).toBe('32');
      expect(shown.getAttribute('height')).toBe('32');
      const word = badge(page).querySelector('[aria-hidden="true"]')!;
      expect(word.textContent?.trim()).toBe('Picked');
      expect(shown.compareDocumentPosition(word) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('announces the badge with the name of the player who picked the card', async () => {
      const { page } = await openPicked(bob.id);

      expect(announced(badge(page))).toBe('Picked by Bob');
    });

    it('falls back to a plain Picked if the avatar fails to load, still announcing the name', async () => {
      const { fixture, page } = await openPicked(bob.id);

      avatar(badge(page))!.dispatchEvent(new Event('error'));
      await fixture.whenStable();

      expect(avatar(badge(page))).toBeNull();
      expect(badge(page).textContent).toContain('Picked');
      expect(announced(badge(page))).toBe('Picked by Bob');
    });

    it('names the player who picked a card in its detail, with their avatar', async () => {
      const { fixture, page } = await openPicked(bob.id);

      const detail = await openDetail(fixture, page, 0);

      expect(detail.textContent).toContain('Picked by Bob');
      expect(detail.textContent).not.toContain('Already picked.');
      expect(avatar(detail)?.getAttribute('src')).toBe(bob.avatarUrl);
    });

    it('still names the player in card detail if the avatar fails to load', async () => {
      const { fixture, page } = await openPicked(bob.id);

      const detail = await openDetail(fixture, page, 0);
      avatar(detail)!.dispatchEvent(new Event('error'));
      await fixture.whenStable();

      expect(avatar(detail)).toBeNull();
      expect(detail.textContent).toContain('Picked by Bob');
    });

    it('shows a bot’s pick the same way', async () => {
      const bot = {
        id: 'bot:1',
        name: 'Bot 1',
        avatarUrl: 'https://cdn.discordapp.com/embed/avatars/0.png',
        isBot: true,
      };
      const { fixture, page } = await openPicked(bot.id, { players: [alicePlayer, bot] });

      expect(avatar(badge(page))?.getAttribute('src')).toBe(bot.avatarUrl);
      expect(announced(badge(page))).toBe('Picked by Bot 1');
      const detail = await openDetail(fixture, page, 0);
      expect(detail.textContent).toContain('Picked by Bot 1');
      expect(avatar(detail)?.getAttribute('src')).toBe(bot.avatarUrl);
    });

    it('badges a card picked by someone no longer among the players as picked by another player', async () => {
      const { fixture, page } = await openPicked('gone');

      expect(announced(badge(page))).toBe('Picked by another player');
      expect(avatar(badge(page))).toBeNull();
      const detail = await openDetail(fixture, page, 0);
      expect(detail.textContent).toContain('Picked by another player');
      expect(avatar(detail)).toBeNull();
    });

    it('shows a new pick’s badge through live updates, and removes it when it’s undone', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, bobUp, { cards: [shivan] });
      expect(badge(page)).toBeNull();

      updates.events.next({ type: 'changed', draft: draft({ ...bobUp, version: 1 }) });
      await flushPicks([pickBy(bob.id)]);
      await flushQueueAndPlan();
      await fixture.whenStable();
      expect(announced(badge(page))).toBe('Picked by Bob');

      updates.events.next({ type: 'changed', draft: draft({ ...bobUp, version: 2 }) });
      await flushPicks([]);
      await flushQueueAndPlan();
      await fixture.whenStable();
      expect(badge(page)).toBeNull();
    });
  });

  it('offers no picks or queue changes on a card, but keeps the exports', async () => {
    const { fixture, page } = await openDraft(
      completeSnapshot,
      {
        state: 'Closed',
        players: [alicePlayer, bob],
        turn: null,
      },
      {
        cards: [brightclimb],
        picks: [
          pickOf({
            poolCardId: brightclimb.id,
          }),
        ],
      },
    );

    const detail = await openDetail(fixture, page, 0);
    expect(button(detail, 'Add to queue')).toBeUndefined();
    expect(button(detail, 'Pick')).toBeUndefined();
    button(detail, 'Close')!.click();
    await fixture.whenStable();

    await openPlan(fixture, page);
    expect(button(page, 'Copy for Arena')).toBeDefined();
    expect(button(page, 'Copy for Moxfield')).toBeDefined();
  });
});
