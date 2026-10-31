import { TestBed } from '@angular/core/testing';
import { type PickView } from '../drafts';
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
} from './harness';

useDraftsApp();

describe('board tab', () => {
  const picks: PickView[] = [
    {
      pick: 1,
      playerId: bob.id,
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
    {
      pick: 3,
      playerId: alice.id,
      oracleId: 'spike-oracle',
      name: 'Lava Spike',
      layout: 'normal',
      set: 'ima',
      collectorNumber: '1',
    },
  ];

  async function openBoard(picks: PickView[]) {
    const opened = await openDraft(
      completeSnapshot,
      {
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
  async function openBoardUnanswered() {
    const { fixture, page } = await openUrl('/drafts/draft-1');
    http.expectOne('/api/drafts/draft-1').flush(
      draft({
        snapshot: completeSnapshot,
        state: 'Drafting',
        players: [bob],
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
    expect(panel(page).textContent).toContain('Loading the picks…');
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

    const log = [...pickLog(page).querySelectorAll('li')].map((li) =>
      [...li.querySelectorAll(':scope > span')].map((span) => span.textContent?.trim()),
    );
    expect(log).toEqual([
      ['1', 'Bob', 'Shock'],
      ['2', 'Alice', 'Lightning Bolt'],
      ['3', 'Alice', 'Lava Spike'],
    ]);
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

  it('says when nobody has picked yet', async () => {
    const { page } = await openBoard([]);

    expect(pickLog(page).textContent).toContain('No picks yet.');
  });

  describe('a player’s picks', () => {
    /** The open panel's heading and its picks: pick number and card. */
    const shownPlayer = (root: HTMLElement) => ({
      heading: panel(root).querySelector('h2')?.textContent,
      picks: [...panel(root).querySelectorAll('li')].map((li) =>
        [...li.querySelectorAll(':scope > span')].map((span) => span.textContent?.trim()),
      ),
    });

    it('lists your picks on the Me tab', async () => {
      const { fixture, page } = await openBoard(picks);

      tabButton(page, 'Me').click();
      await fixture.whenStable();

      expect(tabButton(page, 'Me').getAttribute('aria-selected')).toBe('true');
      expect(shownPlayer(page)).toEqual({
        heading: 'Your picks',
        picks: [
          ['2', 'Lightning Bolt'],
          ['3', 'Lava Spike'],
        ],
      });
    });

    it('opens any player’s picks from the Board, and goes back', async () => {
      const { fixture, page } = await openBoard(picks);
      const bobsColumn = panel(page).querySelector('.player-picks section')!;

      bobsColumn.querySelector<HTMLButtonElement>('h3 button')!.click();
      await fixture.whenStable();

      expect(shownPlayer(page)).toEqual({ heading: 'Bob’s picks', picks: [['1', 'Shock']] });
      expect(tabButton(page, 'Board').getAttribute('aria-selected')).toBe('true');
      expect(tabButton(page, 'Me').getAttribute('aria-selected')).toBe('false');
      [...panel(page).querySelectorAll('button')]
        .find((button) => button.textContent?.includes('Board'))!
        .click();
      await fixture.whenStable();
      expect(panel(page).querySelector('h2')?.textContent).toBe('Board');
    });

    describe('copying picks', () => {
      const copyButton = (root: HTMLElement, target: 'Arena' | 'Moxfield' = 'Arena') =>
        [...panel(root).querySelectorAll('button')].find((button) =>
          button.textContent?.includes(`Copy for ${target}`),
        );
      const writeText = vi.fn<(text: string) => Promise<void>>();

      beforeEach(() => {
        writeText.mockReset().mockResolvedValue();
        Object.defineProperty(navigator, 'clipboard', {
          value: { writeText },
          configurable: true,
        });
      });

      afterEach(() => {
        Reflect.deleteProperty(navigator, 'clipboard');
      });

      /** Opens Bob's picks from the Board. */
      async function openBobsPicks(bobsPicks: PickView[]) {
        const opened = await openBoard(bobsPicks);
        panel(opened.page)
          .querySelector<HTMLButtonElement>('.player-picks section h3 button')!
          .click();
        await opened.fixture.whenStable();
        return opened;
      }

      it('copies any player’s picks for Arena, with multi-face cards named its way', async () => {
        const { fixture, page } = await openBobsPicks([
          {
            pick: 1,
            playerId: bob.id,
            oracleId: 'shock-oracle',
            name: 'Shock',
            layout: 'normal',
            set: 'ima',
            collectorNumber: '1',
          },
          {
            pick: 3,
            playerId: bob.id,
            oracleId: 'giant-oracle',
            name: 'Bonecrusher Giant // Stomp',
            layout: 'adventure',
            set: 'ima',
            collectorNumber: '1',
          },
          {
            pick: 5,
            playerId: bob.id,
            oracleId: 'commit-oracle',
            name: 'Commit // Memory',
            layout: 'split',
            set: 'ima',
            collectorNumber: '1',
          },
        ]);

        copyButton(page)!.click();
        await fixture.whenStable();

        expect(writeText).toHaveBeenCalledExactlyOnceWith(
          'Deck\n1 Shock\n1 Bonecrusher Giant\n1 Commit // Memory',
        );
        expect(panel(page).querySelector('[role="status"]')?.textContent).toContain('Copied');
      });

      it('copies any player’s picks for Moxfield, with their printings', async () => {
        const { fixture, page } = await openBobsPicks([
          {
            pick: 1,
            playerId: bob.id,
            oracleId: 'shock-oracle',
            name: 'Shock',
            layout: 'normal',
            set: 'm21',
            collectorNumber: '159',
          },
          {
            pick: 3,
            playerId: bob.id,
            oracleId: 'giant-oracle',
            name: 'Bonecrusher Giant // Stomp',
            layout: 'adventure',
            set: 'eld',
            collectorNumber: '115',
          },
        ]);

        copyButton(page, 'Moxfield')!.click();
        await fixture.whenStable();

        expect(writeText).toHaveBeenCalledExactlyOnceWith(
          '1 Shock (M21) 159\n1 Bonecrusher Giant // Stomp (ELD) 115',
        );
        expect(panel(page).querySelector('[role="status"]')?.textContent).toContain(
          'Copied for Moxfield',
        );
      });

      it('reports a failed copy for Moxfield when the clipboard refuses', async () => {
        writeText.mockRejectedValue(new Error('denied'));
        const { fixture, page } = await openBobsPicks(picks);

        copyButton(page, 'Moxfield')!.click();
        await fixture.whenStable();

        expect(panel(page).querySelector('[role="alert"]')?.textContent).toContain("Couldn't copy");
        expect(panel(page).querySelector('[role="status"]')).toBeNull();
      });

      it('reports a failed copy for Arena when the clipboard refuses', async () => {
        writeText.mockRejectedValue(new Error('denied'));
        const { fixture, page } = await openBobsPicks(picks);

        copyButton(page)!.click();
        await fixture.whenStable();

        expect(panel(page).querySelector('[role="alert"]')?.textContent).toContain("Couldn't copy");
        expect(panel(page).querySelector('[role="status"]')).toBeNull();
      });

      it('clears the copy status once another player’s picks are opened', async () => {
        const { fixture, page } = await openBobsPicks(picks);
        copyButton(page)!.click();
        await fixture.whenStable();

        tabButton(page, 'Me').click();
        await fixture.whenStable();

        expect(panel(page).querySelector('[role="status"]')).toBeNull();
      });

      it('offers nothing to copy for a player with no picks', async () => {
        const { page } = await openBobsPicks([]);

        expect(copyButton(page)).toBeUndefined();
      });
    });

    it('still shows a complete draft’s picks, with no turn', async () => {
      const { fixture, page } = await openDraft(
        completeSnapshot,
        { state: 'Complete', players: [bob, alicePlayer], turn: null },
        { picks: picks },
      );

      expect(page.querySelector('.state')?.textContent).toBe('Complete');
      expect(page.querySelector('.turn')).toBeNull();
      tabButton(page, 'Me').click();
      await fixture.whenStable();
      expect(shownPlayer(page).picks).toEqual([
        ['2', 'Lightning Bolt'],
        ['3', 'Lava Spike'],
      ]);
    });

    it('offers the Me tab only to players', async () => {
      const { page } = await openDraft(completeSnapshot, {
        state: 'Drafting',
        players: [bob],
        turn: { pick: 1, round: 1, playerId: bob.id },
      });

      expect(tabButton(page, 'Me').disabled).toBe(true);
    });
  });
});
