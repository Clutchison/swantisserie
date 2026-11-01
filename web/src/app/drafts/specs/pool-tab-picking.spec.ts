import { type DraftView, EMPTY_QUEUE, type PickView } from '../drafts';
import {
  useDraftsApp,
  alice,
  draft,
  http,
  updates,
  bob,
  alicePlayer,
  tabButton,
  openDraft,
  flushPicks,
  flushQueue,
  completeSnapshot,
  button,
} from './harness';
import { useTallScreen, shivan, brightclimb, tiles, openDetail } from './pool-tab-harness';

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
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [brightclimb, shivan],
      });

      const detail = await openDetail(fixture, page, 1);
      button(detail, 'Pick')!.click();
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

    it('offers no Pick to someone who is not a player', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ players: [bob] }), {
        cards: [shivan],
      });

      expect(button(await openDetail(fixture, page, 0), 'Pick')).toBeUndefined();
    });

    it('offers no Pick before the draft starts', async () => {
      const { fixture, page } = await openDraft(
        completeSnapshot,
        { players: [alicePlayer, bob] },
        { cards: [shivan] },
      );

      expect(button(await openDetail(fixture, page, 0), 'Pick')).toBeUndefined();
    });

    it('says why a pick was refused, and catches up with the draft', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), { cards: [shivan] });

      const detail = await openDetail(fixture, page, 0);
      button(detail, 'Pick')!.click();
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

  describe('who picked a card', () => {
    const drafting: Partial<DraftView> = {
      state: 'Drafting',
      players: [alicePlayer, bob],
      turn: { pick: 2, round: 1, playerId: bob.id },
    };
    const pickBy = (playerId: string): PickView => ({
      pick: 1,
      playerId,
      oracleId: 'shivan-oracle',
      name: 'Shivan Dragon',
      layout: 'normal',
      set: 'ima',
      collectorNumber: '1',
    });
    const openPicked = (playerId: string, fields: Partial<DraftView> = {}) =>
      openDraft(
        completeSnapshot,
        { ...drafting, ...fields },
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

    it('shows a new pick’s badge through live updates, and removes it when it’s undone', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting, { cards: [shivan] });
      expect(badge(page)).toBeNull();

      updates.events.next({ type: 'changed', draft: draft({ ...drafting, version: 1 }) });
      await flushPicks([pickBy(bob.id)]);
      await flushQueue(EMPTY_QUEUE);
      await fixture.whenStable();
      expect(announced(badge(page))).toBe('Picked by Bob');

      updates.events.next({ type: 'changed', draft: draft({ ...drafting, version: 2 }) });
      await flushPicks([]);
      await flushQueue(EMPTY_QUEUE);
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
    expect(button(detail, 'Add to queue')).toBeUndefined();
    expect(button(detail, 'Pick')).toBeUndefined();
    button(detail, 'Close')!.click();
    await fixture.whenStable();

    tabButton(page, 'Me').click();
    await fixture.whenStable();
    expect(button(page, 'Copy for Arena')).toBeDefined();
    expect(button(page, 'Copy for Moxfield')).toBeDefined();
  });
});
