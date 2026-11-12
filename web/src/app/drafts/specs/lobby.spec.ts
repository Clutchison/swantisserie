import type { DraftChangeRefusal, PoolSnapshotView } from 'contract';
import { MAX_PLAYERS } from 'engine';
import {
  useDraftsApp,
  serverError,
  alertIn,
  alice,
  draft,
  http,
  section,
  bob,
  alicePlayer,
  openDraft,
  flushQueueAndPlan,
  flushPicks,
  completeSnapshot,
  button,
  buttonOrder,
  playerAvatar,
  statusMessage,
  ORGANIZE_ONLY,
  ALL_POWERS,
  powersAnswer,
  RETRY_FAILED,
} from './harness';
import { moreButton, openMore } from './draft-header-harness';

useDraftsApp();

const PLAYERS_FAILED = "Couldn't update the players.";

describe('lobby', () => {
  it('lists the players with their avatars', async () => {
    const { page } = await openDraft(completeSnapshot, { players: [bob, alicePlayer] });

    const players = section(page, 'Players');
    const items = [...players.querySelectorAll('li')];
    expect(items.map((li) => li.querySelector('.name')?.textContent)).toEqual(['Bob', 'Alice']);
    expect(playerAvatar(page, 'Bob')?.getAttribute('src')).toBe(bob.avatarUrl);
  });

  it('leaves out an avatar that fails to load, keeping the other players’', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, { players: [bob, alicePlayer] });

    playerAvatar(page, 'Bob')!.dispatchEvent(new Event('error'));
    await fixture.whenStable();

    expect(playerAvatar(page, 'Bob')).toBeFalsy();
    expect(playerAvatar(page, 'Alice')?.getAttribute('src')).toBe(alicePlayer.avatarUrl);
    expect(section(page, 'Players').textContent).toContain('Bob');
  });

  it('says when nobody has joined yet', async () => {
    const { page } = await openDraft(completeSnapshot, { players: [] });

    expect(section(page, 'Players').textContent).toContain('Nobody has joined yet');
  });

  it('joins the draft, then offers to leave it', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, { players: [bob] });
    expect(button(page, 'Leave')).toBeUndefined();

    button(page, 'Join')!.click();
    const req = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/players'));
    expect(req.request.method).toBe('POST');
    req.flush(draft({ players: [bob, alicePlayer] }), { status: 201, statusText: 'Created' });
    await flushQueueAndPlan();
    await fixture.whenStable();

    expect(section(page, 'Players').textContent).toContain('Alice');
    expect(button(page, 'Join')).toBeUndefined();
    button(page, 'Leave')!.click();
    const left = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/players/me'));
    expect(left.request.method).toBe('DELETE');
    left.flush(draft({ players: [bob] }));
    await fixture.whenStable();

    expect(section(page, 'Players').textContent).not.toContain('Alice');
    expect(button(page, 'Join')).toBeDefined();
  });

  it('offers Leave, More, then Start draft in the header to a joined organizer, with Cancel draft in More', async () => {
    powersAnswer(ALL_POWERS);
    const { page } = await openDraft(completeSnapshot, { players: [alicePlayer] });

    expect(buttonOrder(page, 'Start draft')).toEqual(['Leave', 'More', 'Start draft']);
    expect(openMore(page)).toEqual(['Cancel draft']);
  });

  it('offers Join, More, then Start draft in the header to an organizer who hasn’t joined', async () => {
    powersAnswer(ALL_POWERS);
    const { page } = await openDraft(completeSnapshot, { players: [bob] });

    expect(buttonOrder(page, 'Start draft')).toEqual(['Join', 'More', 'Start draft']);
  });

  it('offers the organizer Randomize seats, Add bot, then Import picks beside the seat order', async () => {
    powersAnswer(ALL_POWERS);
    const { page } = await openDraft(completeSnapshot, { players: [alicePlayer] });

    expect(buttonOrder(section(page, 'Players'), 'Add bot')).toEqual([
      'Randomize seats',
      'Add bot',
      'Import picks',
    ]);
  });

  it('offers a viewer who may not organize Join alone in the header, and no More', async () => {
    const { page } = await openDraft(completeSnapshot, { players: [bob] });

    expect(button(page, 'Join')).toBeDefined();
    expect(button(page, 'Start draft')).toBeUndefined();
    expect(moreButton(page)).toBeUndefined();
  });

  it('shows the draft as full at the most players a draft can have, offering no Join', async () => {
    const players = Array.from({ length: MAX_PLAYERS }, (_, i) => ({
      ...bob,
      id: `player-${i}`,
      name: `Player ${i + 1}`,
    }));
    const { page } = await openDraft(completeSnapshot, { players });

    expect(page.textContent).toContain('This draft is full.');
    expect(button(page, 'Join')).toBeUndefined();
  });

  it('offers Join with room for one more player', async () => {
    const players = Array.from({ length: MAX_PLAYERS - 1 }, (_, i) => ({
      ...bob,
      id: `player-${i}`,
      name: `Player ${i + 1}`,
    }));
    const { page } = await openDraft(completeSnapshot, { players });

    expect(page.textContent).not.toContain('This draft is full.');
    expect(button(page, 'Join')).toBeDefined();
  });

  it('offers neither once the draft has started', async () => {
    const { page } = await openDraft(completeSnapshot, {
      state: 'Drafting',
      players: [alicePlayer],
    });

    expect(button(page, 'Join')).toBeUndefined();
    expect(button(page, 'Leave')).toBeUndefined();
  });

  it('shows the draft as started when a join is refused for it', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, { players: [bob] });

    button(page, 'Join')!.click();
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/players'))).flush(
      { error: 'draft-started', message: 'This draft has started.' } satisfies DraftChangeRefusal,
      { status: 409, statusText: 'Conflict' },
    );
    // The page re-reads the draft to catch up with its new state.
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(
      draft({ state: 'Drafting', players: [bob] }),
    );
    await flushPicks([]);
    await fixture.whenStable();

    expect(page.querySelector('.error')?.textContent).toContain('This draft has started.');
    expect(page.textContent).toContain('Drafting');
    expect(button(page, 'Join')).toBeUndefined();
  });

  it('forgets a failed change once another goes through', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, { players: [bob] });
    button(page, 'Join')!.click();
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/players'))).flush(
      null,
      serverError,
    );
    await fixture.whenStable();
    await vi.waitFor(() => expect(alertIn(page)?.textContent).toContain(PLAYERS_FAILED));

    button(page, 'Join')!.click();
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/players'))).flush(
      draft({ players: [bob, alicePlayer] }),
      { status: 201, statusText: 'Created' },
    );
    await flushQueueAndPlan();
    await fixture.whenStable();

    await vi.waitFor(() => expect(button(page, 'Leave')).toBeDefined());
    expect(alertIn(page)).toBeNull();
  });

  describe('beside a failed pool snapshot', () => {
    beforeEach(() => powersAnswer(ORGANIZE_ONLY));
    const failedSnapshot: PoolSnapshotView = {
      state: 'Failed',
      cards: 0,
      total: null,
      error: 'Scryfall is down',
    };

    it('forgets a failed change once the organizer retries the snapshot', async () => {
      const { fixture, page } = await openDraft(failedSnapshot, { players: [bob] });
      button(page, 'Join')!.click();
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/players'))).flush(
        null,
        serverError,
      );
      await fixture.whenStable();
      await vi.waitFor(() => expect(page.textContent).toContain(PLAYERS_FAILED));

      button(page, 'Retry')!.click();
      const retry = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/snapshot'));
      await fixture.whenStable();
      expect(page.textContent).not.toContain(PLAYERS_FAILED);

      retry.flush(null, serverError);
      await fixture.whenStable();
    });

    it('forgets a failed retry once the organizer sends a change', async () => {
      const { fixture, page } = await openDraft(failedSnapshot, { players: [bob] });
      button(page, 'Retry')!.click();
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/snapshot'))).flush(
        null,
        serverError,
      );
      await fixture.whenStable();
      await vi.waitFor(() => expect(page.textContent).toContain(RETRY_FAILED));

      button(page, 'Join')!.click();
      const join = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/players'));
      await fixture.whenStable();
      expect(page.textContent).not.toContain(RETRY_FAILED);

      join.flush(null, serverError);
      await fixture.whenStable();
    });
  });

  describe('focus after a change', () => {
    const carol = { ...bob, id: 'carol', name: 'Carol' };
    beforeEach(() => powersAnswer(ORGANIZE_ONLY));

    it('keeps focus on a player’s move button as they move a seat, and says where they went', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, {
        players: [alicePlayer, bob, carol],
      });
      const players = section(page, 'Players');

      button(players, 'Move Bob later')!.focus();
      button(players, 'Move Bob later')!.click();
      await fixture.whenStable();
      const pressed = button(players, 'Move Bob later')!;
      expect(pressed.getAttribute('aria-disabled')).toBe('true');
      expect(document.activeElement).toBe(pressed);
      pressed.click();
      const req = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/seats'));
      expect(req.request.body).toEqual({ playerIds: [alice.id, carol.id, bob.id] });
      req.flush(draft({ players: [alicePlayer, carol, bob] }));
      await fixture.whenStable();

      await vi.waitFor(() => expect(statusMessage(players, 'Bob moved to seat 3')).toBeDefined());
      // Bob is now last, so his Move later is gone; focus goes to his other move button.
      expect(document.activeElement).toBe(button(players, 'Move Bob earlier'));
    });

    it('keeps focus on the same move button while the player can still move that way', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, {
        players: [alicePlayer, bob, carol],
      });
      const players = section(page, 'Players');

      button(players, 'Move Alice later')!.focus();
      button(players, 'Move Alice later')!.click();
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/seats'))).flush(
        draft({ players: [bob, alicePlayer, carol] }),
      );
      await fixture.whenStable();

      await vi.waitFor(() => expect(statusMessage(players, 'Alice moved to seat 2')).toBeDefined());
      expect(document.activeElement).toBe(button(players, 'Move Alice later'));
    });

    it('moves focus to a player’s Move later once they move into the first seat', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, {
        players: [alicePlayer, bob, carol],
      });
      const players = section(page, 'Players');

      button(players, 'Move Bob earlier')!.focus();
      button(players, 'Move Bob earlier')!.click();
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/seats'))).flush(
        draft({ players: [bob, alicePlayer, carol] }),
      );
      await fixture.whenStable();

      await vi.waitFor(() => expect(statusMessage(players, 'Bob moved to seat 1')).toBeDefined());
      expect(document.activeElement).toBe(button(players, 'Move Bob later'));
    });

    it('says no player moved when moving a seat fails', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, {
        players: [alicePlayer, bob, carol],
      });
      const players = section(page, 'Players');

      button(players, 'Move Bob later')!.focus();
      button(players, 'Move Bob later')!.click();
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/seats'))).flush(
        null,
        serverError,
      );
      await fixture.whenStable();

      await vi.waitFor(() => expect(alertIn(page)?.textContent).toContain(PLAYERS_FAILED));
      expect(statusMessage(players, 'Bob moved to seat 3')).toBeUndefined();
    });

    it('moves focus from Join to Leave, and back', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, { players: [bob] });

      button(page, 'Join')!.focus();
      button(page, 'Join')!.click();
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/players'))).flush(
        draft({ players: [bob, alicePlayer] }),
        { status: 201, statusText: 'Created' },
      );
      await flushQueueAndPlan();
      await fixture.whenStable();
      await vi.waitFor(() => expect(document.activeElement).toBe(button(page, 'Leave')));

      button(page, 'Leave')!.click();
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/players/me'))).flush(
        draft({ players: [bob] }),
      );
      await fixture.whenStable();
      await vi.waitFor(() => expect(document.activeElement).toBe(button(page, 'Join')));
    });

    it('keeps focus on Join when joining fails', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, { players: [bob] });

      button(page, 'Join')!.focus();
      button(page, 'Join')!.click();
      await fixture.whenStable();
      expect(button(page, 'Join')!.getAttribute('aria-disabled')).toBe('true');
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/players'))).flush(
        null,
        serverError,
      );
      await fixture.whenStable();

      await vi.waitFor(() => expect(alertIn(page)?.textContent).toContain(PLAYERS_FAILED));
      expect(button(page, 'Join')!.getAttribute('aria-disabled')).toBeNull();
      expect(document.activeElement).toBe(button(page, 'Join'));
    });
  });
});
