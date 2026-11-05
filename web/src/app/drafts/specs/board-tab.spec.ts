import { TestBed } from '@angular/core/testing';
import type { PickView } from 'contract';
import {
  useDraftsApp,
  alice,
  draft,
  http,
  openUrl,
  bob,
  alicePlayer,
  tabButton,
  panel,
  openDraft,
  flushPool,
  completeSnapshot,
  expectLoadingAnimation,
  type DraftFixture,
  pickOf,
  updates,
  flushQueueAndPlan,
} from './harness';

useDraftsApp();

/** The text of each of a list row's cells: a pick log row's, or a player's pick's. */
const rowText = (li: Element) =>
  [...li.querySelectorAll(':scope > span, :scope > app-card-name')].map((cell) =>
    cell.textContent?.trim(),
  );

describe('board tab', () => {
  const picks: PickView[] = [
    pickOf({
      playerId: bob.id,
      poolCardId: 'shock-card',
      name: 'Shock',
      typeLine: 'Instant',
      set: 'ima',
      collectorNumber: '1',
    }),
    pickOf({
      pick: 2,
      poolCardId: 'bolt-card',
      name: 'Lightning Bolt',
      typeLine: 'Instant',
      set: 'ima',
      collectorNumber: '1',
    }),
    pickOf({
      pick: 3,
      poolCardId: 'spike-card',
      name: 'Lava Spike',
      typeLine: 'Sorcery — Arcane',
      set: 'ima',
      collectorNumber: '1',
    }),
  ];

  async function openBoard(picks: PickView[], fields: DraftFixture = {}) {
    const opened = await openDraft(
      completeSnapshot,
      {
        ...fields,
        state: 'Drafting',
        players: [bob, alicePlayer],
        turn: { pick: 4, round: 2, playerId: bob.id },
      },
      { picks: picks },
    );
    tabButton(opened.page, 'Board').click();
    await opened.fixture.whenStable();
    return opened;
  }

  const pickLog = (root: HTMLElement) => panel(root).querySelector<HTMLElement>('.log')!;

  /** Opens the Board tab with the GET of the picks left for the test to answer. */
  async function openBoardUnanswered(players = [bob]) {
    const { fixture, page } = await openUrl('/drafts/draft-1');
    http.expectOne('/api/drafts/draft-1').flush(
      draft({
        snapshot: completeSnapshot,
        state: 'Drafting',
        players,
        turn: { pick: 1, round: 1, playerId: bob.id },
      }),
    );
    await flushPool();
    const req = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/picks'));
    tabButton(page, 'Board').click();
    await vi.waitFor(() => {
      TestBed.tick();
      expect(panel(page).querySelector('h2')?.textContent).toBe('Board');
    });
    return { fixture, page, req };
  }

  it('says the picks are loading, not that there are none, until they arrive', async () => {
    const { fixture, page, req } = await openBoardUnanswered();
    await expectLoadingAnimation(() => panel(page), 'Loading the picks…', 64);
    expect(panel(page).textContent).not.toContain('No picks yet');

    req.flush([]);
    await fixture.whenStable();
    expect(panel(page).textContent).not.toContain('Loading the picks…');
    expect(panel(page).textContent).toContain('No picks yet');
  });

  it('does not say there are no picks when they failed to load', async () => {
    const { fixture, page, req } = await openBoardUnanswered();

    req.flush(null, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();

    expect(panel(page).textContent).toContain("Couldn't load the picks.");
    expect(panel(page).textContent).not.toContain('No picks yet');
  });

  it('keeps the pick log it had when a re-read of the picks fails', async () => {
    const { fixture, page } = await openBoard(picks);

    updates.events.next({
      type: 'changed',
      draft: draft({
        snapshot: completeSnapshot,
        state: 'Drafting',
        players: [bob, alicePlayer],
        turn: { pick: 4, round: 2, playerId: bob.id },
        version: 1,
      }),
    });
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/picks'))).flush(null, {
      status: 503,
      statusText: 'Service Unavailable',
    });
    await flushQueueAndPlan();
    await fixture.whenStable();

    expect(panel(page).textContent).not.toContain("Couldn't load the picks.");
    const log = [...pickLog(page).querySelectorAll('li')].map((li) => rowText(li));
    expect(log).toEqual([
      ['1', 'Bob', 'Shock'],
      ['2', 'Alice', 'Lightning Bolt'],
      ['3', 'Alice', 'Lava Spike'],
    ]);
  });

  it('switches between the Pool and Board tabs', async () => {
    const { fixture, page } = await openBoard(picks);

    expect(tabButton(page, 'Board').getAttribute('aria-selected')).toBe('true');
    expect(tabButton(page, 'Pool').getAttribute('aria-selected')).toBe('false');
    expect(panel(page).querySelector('h2')?.textContent).toBe('Board');

    tabButton(page, 'Pool').click();
    await fixture.whenStable();
    expect(panel(page).querySelector('h2')?.textContent).toBe('Pool');
  });

  it('shows the pick log: pick number, player and card', async () => {
    const { page } = await openBoard(picks);

    const log = [...pickLog(page).querySelectorAll('li')].map((li) => rowText(li));
    expect(log).toEqual([
      ['1', 'Bob', 'Shock'],
      ['2', 'Alice', 'Lightning Bolt'],
      ['3', 'Alice', 'Lava Spike'],
    ]);
  });

  it('names a pick log player who is no longer among the players as another player', async () => {
    const { page } = await openBoard([{ ...picks[0]!, playerId: 'gone' }, picks[1]!]);

    const log = [...pickLog(page).querySelectorAll('li')].map((li) => rowText(li));
    expect(log).toEqual([
      ['1', 'another player', 'Shock'],
      ['2', 'Alice', 'Lightning Bolt'],
    ]);
  });

  it('gives a pick log player’s full name on hover, with a bot’s badge outside the name', async () => {
    const longName = 'Bartholomew the Exceedingly Long';
    const bot = { ...bob, id: 'bot:1', name: longName, isBot: true };
    const { page } = await openDraft(
      completeSnapshot,
      {
        state: 'Drafting',
        players: [bot, alicePlayer],
        turn: { pick: 3, round: 1, playerId: alice.id },
      },
      { picks: [{ ...picks[0]!, playerId: bot.id }, picks[1]!] },
    );
    tabButton(page, 'Board').click();
    await vi.waitFor(() => {
      TestBed.tick();
      expect(pickLog(page).querySelectorAll('li')).toHaveLength(2);
    });

    const [botRow, aliceRow] = [...pickLog(page).querySelectorAll('li')];
    const botName = botRow!.querySelector<HTMLElement>(`[title="${longName}"]`)!;
    expect(botName.textContent?.trim()).toBe(longName);
    expect(botName.parentElement?.querySelector('.badge')?.textContent).toBe('Bot');
    expect(aliceRow!.querySelector('[title="Alice"]')?.textContent?.trim()).toBe('Alice');
    expect(aliceRow!.querySelector('.badge')).toBeNull();
  });

  it('leaves hover text off a pick log card, whose Card preview shows it in full', async () => {
    const { page } = await openBoard(picks);

    const card = pickLog(page).querySelector<HTMLElement>('li app-card-name .name')!;
    expect(card.textContent?.trim()).toBe('Shock');
    expect(card.querySelector('[title]')).toBeNull();
    expect(card.hasAttribute('title')).toBe(false);
  });

  it('lists every player’s picks, in seat order', async () => {
    const { page } = await openBoard(picks);

    const players = [...panel(page).querySelectorAll('.player-picks section')].map((player) => ({
      name: player.querySelector('h3')?.textContent?.trim(),
      picks: [...player.querySelectorAll('li')].map((li) => li.textContent?.trim()),
    }));
    expect(players).toEqual([
      { name: 'Bob', picks: ['Shock'] },
      { name: 'Alice', picks: ['Lightning Bolt', 'Lava Spike'] },
    ]);
  });

  it('shows each picked copy of a card as its own pick', async () => {
    const bolt = picks[1]!;
    const { page } = await openBoard([
      { ...bolt, pick: 1, poolCardId: 'bolt-card-1', playerId: bob.id },
      { ...bolt, pick: 2, poolCardId: 'bolt-card-2' },
      { ...bolt, pick: 3, poolCardId: 'bolt-card-3' },
    ]);

    const log = [...pickLog(page).querySelectorAll('li')].map((li) => rowText(li));
    expect(log).toEqual([
      ['1', 'Bob', 'Lightning Bolt'],
      ['2', 'Alice', 'Lightning Bolt'],
      ['3', 'Alice', 'Lightning Bolt'],
    ]);
    const alicePicks = panel(page).querySelectorAll('.player-picks section')[1]!;
    expect([...alicePicks.querySelectorAll('li')].map((li) => li.textContent?.trim())).toEqual([
      'Lightning Bolt',
      'Lightning Bolt',
    ]);
  });

  it('says when nobody has picked yet', async () => {
    const { page } = await openBoard([]);

    expect(pickLog(page).textContent).toContain('No picks yet.');
  });

  it('shows player names as text, not links to their picks', async () => {
    const { page } = await openBoard(picks);

    const bobsColumn = panel(page).querySelector('.player-picks section')!;
    expect(bobsColumn.querySelector('h3')?.textContent?.trim()).toBe('Bob');
    expect(bobsColumn.querySelector('h3 button, h3 a')).toBeNull();
  });
});
