import {
  useDraftsApp,
  alice,
  draft,
  http,
  section,
  alicePlayer,
  bob,
  tabButton,
  panel,
  openDraft,
  completeSnapshot,
  button,
  pickOf,
  poolCardOf,
  ADD_BOTS_ONLY,
  ALL_POWERS,
  ORGANIZE_ONLY,
} from './harness';

useDraftsApp();

describe('bots', () => {
  const bot = {
    id: 'bot:1',
    name: 'Bot 1',
    avatarUrl: 'https://cdn.discordapp.com/embed/avatars/0.png',
    isBot: true,
  };

  /** The text of each badge in `root`. */
  const badges = (root: Element | null) =>
    [...(root?.querySelectorAll('.badge') ?? [])].map((badge) => badge.textContent?.trim());

  it('marks bots with a badge in the players, turn, board and pick log', async () => {
    const { fixture, page } = await openDraft(
      completeSnapshot,
      {
        state: 'Drafting',
        players: [bot, alicePlayer],
        turn: { pick: 3, round: 2, playerId: bot.id },
      },
      {
        cards: [poolCardOf('shock', 'Shock'), poolCardOf('bolt', 'Lightning Bolt')],
        picks: [
          pickOf({
            playerId: bot.id,
            poolCardId: 'shock-card',
          }),
          pickOf({
            pick: 2,
            poolCardId: 'bolt-card',
          }),
        ],
      },
    );

    const seats = section(page, 'Players').querySelectorAll('li');
    expect(badges(seats[0])).toEqual(['Bot']);
    expect(badges(seats[1])).toEqual([]);
    expect(page.querySelector('.turn')?.textContent).toContain('Bot 1’s turn');
    expect(badges(page.querySelector('.turn'))).toEqual(['Bot']);

    tabButton(page, 'Board').click();
    await fixture.whenStable();
    const columns = panel(page).querySelectorAll('.player-picks h3');
    expect(badges(columns[0])).toEqual(['Bot']);
    expect(badges(columns[1])).toEqual([]);
    const log = panel(page).querySelectorAll('.log li');
    expect(log[0].textContent).toContain('Bot 1');
    expect(badges(log[0])).toEqual(['Bot']);
    expect(badges(log[1])).toEqual([]);
  });

  it('lets a viewer who may only add bots add a bot, then remove it', async () => {
    const { fixture, page } = await openDraft(
      completeSnapshot,
      { players: [alicePlayer] },
      { powers: ADD_BOTS_ONLY },
    );

    button(page, 'Add bot')!.click();
    const added = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/bots'));
    expect(added.request.method).toBe('POST');
    added.flush(draft({ players: [alicePlayer, bot] }), { status: 201, statusText: 'Created' });
    await fixture.whenStable();
    expect(section(page, 'Players').textContent).toContain('Bot 1');
    expect(button(page, 'Remove Alice')).toBeUndefined();

    button(page, 'Remove Bot 1')!.click();
    const removed = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/bots/bot%3A1'));
    expect(removed.request.method).toBe('DELETE');
    removed.flush(draft({ players: [alicePlayer] }));
    await fixture.whenStable();
    expect(section(page, 'Players').textContent).not.toContain('Bot 1');
  });

  describe('focus after a change', () => {
    const botNumber = (i: number) => ({ ...bot, id: `bot:${i}`, name: `Bot ${i}` });

    it('moves focus to the next control once adding a bot fills the draft', async () => {
      const players = [alicePlayer, ...Array.from({ length: 10 }, (_, i) => botNumber(i + 1))];
      const { fixture, page } = await openDraft(
        completeSnapshot,
        { players },
        { powers: ALL_POWERS },
      );

      button(page, 'Add bot')!.focus();
      button(page, 'Add bot')!.click();
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/bots'))).flush(
        draft({ players: [...players, botNumber(11)] }),
        { status: 201, statusText: 'Created' },
      );
      await fixture.whenStable();

      await vi.waitFor(() => expect(button(page, 'Add bot')!.disabled).toBe(true));
      await vi.waitFor(() => expect(document.activeElement).toBe(button(page, 'Import picks')));
    });

    it('moves focus to the next bot’s Remove once a bot is removed', async () => {
      const players = [alicePlayer, botNumber(1), botNumber(2)];
      const { fixture, page } = await openDraft(
        completeSnapshot,
        { players },
        { powers: ALL_POWERS },
      );

      button(page, 'Remove Bot 1')!.focus();
      button(page, 'Remove Bot 1')!.click();
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/bots/bot%3A1'))).flush(
        draft({ players: [alicePlayer, botNumber(2)] }),
      );
      await fixture.whenStable();

      await vi.waitFor(() => expect(document.activeElement).toBe(button(page, 'Remove Bot 2')));
    });

    it('moves focus to the next bot’s Remove past the players seated between', async () => {
      const players = [alicePlayer, botNumber(1), bob, botNumber(2)];
      const { fixture, page } = await openDraft(
        completeSnapshot,
        { players },
        { powers: ALL_POWERS },
      );

      button(page, 'Remove Bot 1')!.focus();
      button(page, 'Remove Bot 1')!.click();
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/bots/bot%3A1'))).flush(
        draft({ players: [alicePlayer, bob, botNumber(2)] }),
      );
      await fixture.whenStable();

      await vi.waitFor(() => expect(document.activeElement).toBe(button(page, 'Remove Bot 2')));
    });

    it('moves focus to the bot before once the last bot is removed', async () => {
      const players = [alicePlayer, botNumber(1), botNumber(2)];
      const { fixture, page } = await openDraft(
        completeSnapshot,
        { players },
        { powers: ALL_POWERS },
      );

      button(page, 'Remove Bot 2')!.focus();
      button(page, 'Remove Bot 2')!.click();
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/bots/bot%3A2'))).flush(
        draft({ players: [alicePlayer, botNumber(1)] }),
      );
      await fixture.whenStable();

      await vi.waitFor(() => expect(document.activeElement).toBe(button(page, 'Remove Bot 1')));
    });
  });

  it('offers no more bots once the draft has 12 players', async () => {
    const bots = Array.from({ length: 12 }, (_, i) => ({
      ...bot,
      id: `bot:${i}`,
      name: `Bot ${i + 1}`,
    }));
    const { page } = await openDraft(
      completeSnapshot,
      { players: bots },
      { powers: ADD_BOTS_ONLY },
    );

    expect(button(page, 'Add bot')?.disabled).toBe(true);
  });

  it('offers bot controls only to a viewer who may add bots, not one who may only organize', async () => {
    const { page } = await openDraft(
      completeSnapshot,
      { players: [alicePlayer, bot] },
      { powers: ORGANIZE_ONLY },
    );

    expect(button(page, 'Add bot')).toBeUndefined();
    expect(button(page, 'Remove Bot 1')).toBeUndefined();
  });

  it('offers no bot controls once the draft has started', async () => {
    const { page } = await openDraft(
      completeSnapshot,
      {
        state: 'Drafting',
        players: [alicePlayer, bot],
        turn: { pick: 1, round: 1, playerId: alice.id },
      },
      { powers: ADD_BOTS_ONLY },
    );

    expect(button(page, 'Add bot')).toBeUndefined();
    expect(button(page, 'Remove Bot 1')).toBeUndefined();
  });
});
