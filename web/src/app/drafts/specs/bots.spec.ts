import {
  useDraftsApp,
  alice,
  draft,
  http,
  section,
  alicePlayer,
  tabButton,
  panel,
  openDraft,
  completeSnapshot,
  button,
} from './harness';

useDraftsApp();

describe('bots', () => {
  const bot = {
    id: 'bot:1',
    name: 'Bot 1',
    avatarUrl: 'https://cdn.discordapp.com/embed/avatars/0.png',
    isBot: true,
  };
  const admin = { ...alice, isAdmin: true };

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
        picks: [
          {
            pick: 1,
            playerId: bot.id,
            oracleId: 'shock-oracle',
            name: 'Shock',
            layout: 'normal',
            set: 'ima',
            collectorNumber: '1',
          },
          {
            pick: 2,
            playerId: alice.id,
            oracleId: 'bolt-oracle',
            name: 'Lightning Bolt',
            layout: 'normal',
            set: 'ima',
            collectorNumber: '1',
          },
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

  it('lets an app admin add a bot, then remove it', async () => {
    const { fixture, page } = await openDraft(
      completeSnapshot,
      { players: [alicePlayer] },
      { user: admin },
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

  it('offers no more bots once the draft has 12 players', async () => {
    const bots = Array.from({ length: 12 }, (_, i) => ({
      ...bot,
      id: `bot:${i}`,
      name: `Bot ${i + 1}`,
    }));
    const { page } = await openDraft(completeSnapshot, { players: bots }, { user: admin });

    expect(button(page, 'Add bot')?.disabled).toBe(true);
  });

  it('offers bot controls only to app admins, not the organizer', async () => {
    const { page } = await openDraft(completeSnapshot, { players: [alicePlayer, bot] });

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
      { user: admin },
    );

    expect(button(page, 'Add bot')).toBeUndefined();
    expect(button(page, 'Remove Bot 1')).toBeUndefined();
  });
});
