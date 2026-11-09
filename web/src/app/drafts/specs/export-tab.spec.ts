import { TestBed } from '@angular/core/testing';
import type { PickView, PlanView, PoolCardView } from 'contract';
import type { PickedCard } from '../draft-store';
import { EMPTY_PLAN, EMPTY_QUEUE } from '../drafts';
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
  panelName,
  openDraft,
  flushPool,
  flushQueue,
  flushQueueAndPlan,
  completeSnapshot,
  expectLoadingAnimation,
  type DraftFixture,
  pickOf,
  poolCardOf,
  namedList,
  tabPanel,
  text,
  alertIn,
} from './harness';
import { playing, threePlayers, withTournament } from './play-tab-harness';

useDraftsApp();

/** The text of each of a pick's cells: its number, and its card. */
const rowText = (li: Element) =>
  [...li.querySelectorAll(':scope > span, :scope > app-card-name')].map((cell) =>
    cell.textContent?.trim(),
  );

/**
 * A pick of `name` by `playerId`: of a normal card printed as IMA 1, unless
 * `fields` change its pool card.
 */
const imaPick = (
  pick: number,
  playerId: string,
  poolCardId: string,
  name: string,
  fields: Partial<PoolCardView> = {},
): PickedCard => ({
  ...pickOf({ pick, playerId, poolCardId }),
  card: poolCardOf(poolCardId, name, { id: poolCardId, ...fields }),
});

/** The pool cards `picked` picked, to answer the pool with. */
const cardsOf = (picked: PickedCard[]) => picked.map(({ card }) => card);
/** The picks of `picked`, to answer the pick log with. */
const picksOf = (picked: PickedCard[]): PickView[] =>
  picked.map(({ pick, playerId, poolCardId }) => ({ pick, playerId, poolCardId }));

describe('export tab', () => {
  const picks: PickedCard[] = [
    imaPick(1, bob.id, 'shock-card', 'Shock'),
    imaPick(2, alice.id, 'bolt-card', 'Lightning Bolt'),
    imaPick(3, alice.id, 'spike-card', 'Lava Spike'),
  ];

  /** Opens the draft, Bob then Alice, on the Export tab. */
  async function openExport(
    picked: PickedCard[],
    fields: DraftFixture = {},
    options: Parameters<typeof openDraft>[2] = {},
  ) {
    const opened = await openDraft(
      completeSnapshot,
      {
        state: 'Drafting',
        players: [bob, alicePlayer],
        turn: { pick: 4, round: 2, playerId: bob.id },
        ...fields,
      },
      { cards: cardsOf(picked), picks: picksOf(picked), ...options },
    );
    tabButton(opened.page, 'Export').click();
    await opened.fixture.whenStable();
    return opened;
  }

  /** The Export tab's picks: pick number and card. */
  const shownPicks = (root: HTMLElement) =>
    [...namedList(panel(root), 'Your picks').querySelectorAll('li')].map((li) => rowText(li));

  it('lists only your picks, in pick order, under the Export tab', async () => {
    const { page } = await openExport(picks);

    expect(tabButton(page, 'Export').getAttribute('aria-selected')).toBe('true');
    expect(panel(page).querySelector('h2')?.textContent).toBe('Export');
    expect(shownPicks(page)).toEqual([
      ['2', 'Lightning Bolt'],
      ['3', 'Lava Spike'],
    ]);
  });

  it('still shows a complete draft’s picks, with no turn', async () => {
    const { page } = await openExport(picks, { state: 'Complete', turn: null });

    expect(page.querySelector('.turn')).toBeNull();
    expect(shownPicks(page)).toEqual([
      ['2', 'Lightning Bolt'],
      ['3', 'Lava Spike'],
    ]);
  });

  it('offers the Export tab only to players', async () => {
    const { page } = await openDraft(completeSnapshot, {
      state: 'Drafting',
      players: [bob],
      turn: { pick: 1, round: 1, playerId: bob.id },
    });

    expect(tabButton(page, 'Export').disabled).toBe(true);
  });

  it('says your picks are loading until they arrive', async () => {
    const { fixture, page } = await openUrl('/drafts/draft-1');
    http.expectOne('/api/drafts/draft-1').flush(
      draft({
        snapshot: completeSnapshot,
        state: 'Drafting',
        players: [alicePlayer, bob],
        turn: { pick: 1, round: 1, playerId: bob.id },
      }),
    );
    await flushPool();
    const req = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/picks'));
    tabButton(page, 'Export').click();
    await vi.waitFor(() => {
      TestBed.tick();
      expect(panel(page).querySelector('h2')?.textContent).toBe('Export');
    });
    await expectLoadingAnimation(() => panel(page), 'Loading the picks…', 64);

    await flushQueueAndPlan();
    req.flush([]);
    await fixture.whenStable();
    expect(panel(page).textContent).not.toContain('Loading the picks…');
    expect(panel(page).textContent).toContain('No picks yet');
  });

  /** Opens the Export tab with your picks and plan answered, and the pool left for the test to answer. */
  async function openExportPoolUnanswered() {
    const { fixture, page } = await openUrl('/drafts/draft-1');
    http.expectOne('/api/drafts/draft-1').flush(
      draft({
        snapshot: completeSnapshot,
        state: 'Drafting',
        players: [bob, alicePlayer],
        turn: { pick: 4, round: 2, playerId: bob.id },
      }),
    );
    const poolReq = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/pool'));
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/picks'))).flush(picksOf(picks));
    await flushQueueAndPlan();
    tabButton(page, 'Export').click();
    await vi.waitFor(() => {
      TestBed.tick();
      expect(panel(page).querySelector('h2')?.textContent).toBe('Export');
    });
    return { fixture, page, poolReq };
  }

  it('says your picks are loading, and offers nothing to copy, until the pool arrives too', async () => {
    const { fixture, page, poolReq } = await openExportPoolUnanswered();
    await expectLoadingAnimation(() => panel(page), 'Loading the picks…', 64);
    expect(panel(page).querySelectorAll('button')).toHaveLength(0);

    poolReq.flush(cardsOf(picks));
    await fixture.whenStable();
    expect(panel(page).textContent).not.toContain('Loading the picks…');
    expect(shownPicks(page)).toEqual([
      ['2', 'Lightning Bolt'],
      ['3', 'Lava Spike'],
    ]);
    expect(panel(page).textContent).toContain('Copy for Arena');
  });

  it('says your picks couldn’t be loaded, and offers nothing to copy, when the pool failed', async () => {
    const { fixture, page, poolReq } = await openExportPoolUnanswered();

    poolReq.flush(null, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();

    expect(panel(page).textContent).toContain("Couldn't load the picks.");
    expect(panel(page).querySelectorAll('button')).toHaveLength(0);
  });

  describe('copying picks', () => {
    const copyButton = (root: HTMLElement, target: 'Arena' | 'MTGO' | 'Moxfield' = 'Arena') =>
      [...panel(root).querySelectorAll('button')].find((button) =>
        button.textContent?.includes(`Copy for ${target}`),
      );
    /** What a copy button shows: its confirmation, once it has one, or else its label. */
    const shownLabel = (button: HTMLElement) =>
      (button.querySelector('.confirmation') ?? button).textContent?.trim();
    /** The Export tab's panel, even while it's hidden behind another tab. */
    const exportPanel = (root: HTMLElement) => root.querySelector<HTMLElement>('#export-panel')!;
    /** The Arena copy button on the Export tab, even while it's hidden behind another tab. */
    const exportCopyButton = (root: HTMLElement) =>
      [...exportPanel(root).querySelectorAll('button')].find((button) =>
        button.textContent?.includes('Copy for Arena'),
      )!;
    /** What the Export tab's hidden status region announces. */
    const announced = (root: HTMLElement) =>
      exportPanel(root).querySelector('[role="status"]')?.textContent?.trim();
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

    /** Copies for `target`, and answers with what was copied. */
    async function copyFor(
      opened: { fixture: { whenStable(): Promise<unknown> }; page: HTMLElement },
      target: 'Arena' | 'MTGO' | 'Moxfield' = 'Arena',
    ) {
      copyButton(opened.page, target)!.click();
      await opened.fixture.whenStable();
      return writeText.mock.lastCall?.[0];
    }

    const copyTargets = (root: HTMLElement) =>
      [...panel(root).querySelectorAll('button.copy .label')].map((label) =>
        label.textContent?.trim(),
      );

    it('offers copies for Arena and Moxfield on an Arena draft', async () => {
      const { page } = await openExport(picks, { platform: 'Arena' });

      expect(copyTargets(page)).toEqual(['Copy for Arena', 'Copy for Moxfield']);
    });

    it('offers copies for MTGO and Moxfield on an MTGO draft', async () => {
      const { page } = await openExport(picks, { platform: 'MTGO' });

      expect(copyTargets(page)).toEqual(['Copy for MTGO', 'Copy for Moxfield']);
    });

    describe('with every pick on the mainboard', () => {
      const multiFace: PickedCard[] = [
        imaPick(2, alice.id, 'shock-card', 'Shock', { set: 'm21', collectorNumber: '159' }),
        imaPick(4, alice.id, 'giant-card', 'Bonecrusher Giant // Stomp', {
          layout: 'adventure',
          typeLine: 'Creature — Giant // Sorcery — Adventure',
          set: 'eld',
          collectorNumber: '115',
        }),
        imaPick(6, alice.id, 'commit-card', 'Commit // Memory', {
          layout: 'split',
          typeLine: 'Instant // Sorcery',
          set: 'akh',
          collectorNumber: '211',
        }),
        imaPick(7, bob.id, 'bolt-card', 'Lightning Bolt'),
      ];

      it('copies your picks for Arena, with multi-face cards named its way', async () => {
        const opened = await openExport(multiFace);

        expect(await copyFor(opened)).toBe(
          'Deck\n1 Shock\n1 Bonecrusher Giant\n1 Commit // Memory',
        );
        expect(announced(opened.page)).toBe('Copied for Arena');
      });

      it('copies your picks for MTGO, with multi-face cards named its way', async () => {
        const opened = await openExport(multiFace, { platform: 'MTGO' });

        expect(await copyFor(opened, 'MTGO')).toBe('1 Shock\n1 Bonecrusher Giant\n1 Commit/Memory');
        expect(announced(opened.page)).toBe('Copied for MTGO');
      });

      it('copies your picks for Moxfield, with their printings', async () => {
        const opened = await openExport(multiFace);

        expect(await copyFor(opened, 'Moxfield')).toBe(
          '1 Shock (M21) 159\n1 Bonecrusher Giant // Stomp (ELD) 115\n1 Commit // Memory (AKH) 211',
        );
        expect(announced(opened.page)).toBe('Copied for Moxfield');
      });
    });

    describe('from your plan', () => {
      const yourPicks: PickedCard[] = [
        imaPick(1, alice.id, 'shock-card', 'Shock'),
        imaPick(2, bob.id, 'spike-card', 'Lava Spike'),
        imaPick(3, alice.id, 'bolt-card', 'Lightning Bolt'),
        imaPick(5, alice.id, 'opt-card', 'Opt'),
        imaPick(7, alice.id, 'shock-card-2', 'Shock'),
      ];
      /**
       * Bolt and a Shock on the mainboard with basics, Opt and the other Shock
       * on the sideboard, and an unpicked card on each. Its player prefers
       * Kaldheim's Island #395, which no export names.
       */
      const plan: PlanView = {
        mainboard: [
          { poolCardId: 'bolt-card', name: 'Lightning Bolt', picked: true },
          { poolCardId: 'shock-card', name: 'Shock', picked: true },
          { poolCardId: 'brainstorm-card', name: 'Brainstorm', picked: false },
        ],
        sideboard: [
          { poolCardId: 'opt-card', name: 'Opt', picked: true },
          { poolCardId: 'shock-card-2', name: 'Shock', picked: true },
          { poolCardId: 'duress-card', name: 'Duress', picked: false },
        ],
        basics: [
          { land: 'Island', count: 8 },
          { land: 'Mountain', count: 7 },
        ],
        lost: [],
        readyNotice: false,
        preferredPrintings: {
          Island: {
            scryfallId: 'a0000000-0000-4000-8000-000000000395',
            set: 'khm',
            collectorNumber: '395',
            images: {
              small:
                'https://cards.scryfall.io/small/front/a/0/a0000000-0000-4000-8000-000000000395.jpg',
              normal:
                'https://cards.scryfall.io/normal/front/a/0/a0000000-0000-4000-8000-000000000395.jpg',
              large:
                'https://cards.scryfall.io/large/front/a/0/a0000000-0000-4000-8000-000000000395.jpg',
            },
          },
        },
      };

      const openPlanExport = (fields: DraftFixture = {}, yours = plan) =>
        openExport(yourPicks, fields, { plan: yours });

      it('copies it for Arena: the mainboard and its basics, then the sideboard, without unpicked cards', async () => {
        const opened = await openPlanExport();

        expect(await copyFor(opened)).toBe(
          'Deck\n1 Shock\n1 Lightning Bolt\n8 Island\n7 Mountain\n\nSideboard\n1 Opt\n1 Shock',
        );
      });

      it('copies it for MTGO: the mainboard and its basics, a blank line, then the sideboard', async () => {
        const opened = await openPlanExport({ platform: 'MTGO' });

        expect(await copyFor(opened, 'MTGO')).toBe(
          '1 Shock\n1 Lightning Bolt\n8 Island\n7 Mountain\n\n1 Opt\n1 Shock',
        );
      });

      it('copies it for Moxfield: the mainboard and its basics, then the sideboard', async () => {
        const opened = await openPlanExport();

        expect(await copyFor(opened, 'Moxfield')).toBe(
          '1 Shock (IMA) 1\n1 Lightning Bolt (IMA) 1\n8 Island\n7 Mountain\n\nSIDEBOARD:\n1 Opt (IMA) 1\n1 Shock (IMA) 1',
        );
      });

      it('copies a complete draft’s deck, which holds no unpicked cards', async () => {
        const deck: PlanView = {
          ...plan,
          mainboard: plan.mainboard.filter((card) => card.picked),
          sideboard: plan.sideboard.filter((card) => card.picked),
        };
        const opened = await openPlanExport({ state: 'Complete', turn: null }, deck);

        expect(await copyFor(opened)).toBe(
          'Deck\n1 Shock\n1 Lightning Bolt\n8 Island\n7 Mountain\n\nSideboard\n1 Opt\n1 Shock',
        );
      });

      it('copies a locked deck, as its player’s tournament is playing', async () => {
        const deck: PlanView = {
          ...plan,
          mainboard: plan.mainboard.filter((card) => card.picked),
          sideboard: plan.sideboard.filter((card) => card.picked),
        };
        const tournament = playing();
        const opened = await openExport(yourPicks, withTournament(tournament, threePlayers), {
          plan: deck,
          tournament,
        });
        expect(text(tabPanel(opened.page, 'Deck'))).toContain('Your deck is locked');

        expect(await copyFor(opened)).toBe(
          'Deck\n1 Shock\n1 Lightning Bolt\n8 Island\n7 Mountain\n\nSideboard\n1 Opt\n1 Shock',
        );
      });

      it('copies a plan with an empty sideboard as it copies every pick', async () => {
        const opened = await openPlanExport({}, { ...EMPTY_PLAN, mainboard: plan.mainboard });

        expect(await copyFor(opened)).toBe('Deck\n2 Shock\n1 Lightning Bolt\n1 Opt');
      });

      it('offers nothing to copy while your plan is still on its way', async () => {
        const { fixture, page } = await openUrl('/drafts/draft-1');
        http.expectOne('/api/drafts/draft-1').flush(
          draft({
            snapshot: completeSnapshot,
            state: 'Drafting',
            players: [bob, alicePlayer],
            turn: { pick: 8, round: 4, playerId: bob.id },
          }),
        );
        await flushPool(cardsOf(yourPicks));
        (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/picks'))).flush(
          picksOf(yourPicks),
        );
        await flushQueue(EMPTY_QUEUE);
        const planRequest = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/plan'));
        tabButton(page, 'Export').click();
        TestBed.tick();

        expect(shownPicks(page)).toHaveLength(4);
        expect(copyButton(page)).toBeUndefined();
        planRequest.flush(plan);
        await fixture.whenStable();
        expect(copyButton(page)).toBeDefined();
      });

      it('says when your plan couldn’t be loaded, and offers nothing to copy', async () => {
        const { fixture, page } = await openUrl('/drafts/draft-1');
        http.expectOne('/api/drafts/draft-1').flush(
          draft({
            snapshot: completeSnapshot,
            state: 'Drafting',
            players: [bob, alicePlayer],
            turn: { pick: 8, round: 4, playerId: bob.id },
          }),
        );
        await flushPool(cardsOf(yourPicks));
        (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/picks'))).flush(
          picksOf(yourPicks),
        );
        await flushQueue(EMPTY_QUEUE);
        (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/plan'))).flush(null, {
          status: 500,
          statusText: 'Server Error',
        });
        tabButton(page, 'Export').click();
        await fixture.whenStable();

        expect(panel(page).querySelector('.error')?.textContent).toContain(
          "Couldn't load your plan",
        );
        expect(copyButton(page)).toBeUndefined();
      });

      describe('a sideboard over Arena’s 15', () => {
        /** Your plan with `count` picks on the sideboard, each its own card. */
        function sideboardOf(count: number) {
          const sideboardPicks = Array.from({ length: count }, (_, i) =>
            imaPick(i + 1, alice.id, `card-${i}`, `Card ${i}`),
          );
          const yours: PlanView = {
            ...EMPTY_PLAN,
            sideboard: sideboardPicks.map(({ card }) => ({
              poolCardId: card.id,
              name: card.name,
              picked: true,
            })),
          };
          return { sideboardPicks, yours };
        }
        const warning = (root: HTMLElement) => panel(root).querySelector('.notice');

        it('warns that Arena may keep only 15, and still exports every card', async () => {
          const { sideboardPicks, yours } = sideboardOf(16);
          const opened = await openExport(sideboardPicks, {}, { plan: yours });

          expect(warning(opened.page)?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
            "Your sideboard has 16 cards. Arena's import may keep only 15 of them, though your export has them all.",
          );
          const copied = (await copyFor(opened))!.split('\n');
          expect(copied.slice(copied.indexOf('Sideboard') + 1)).toHaveLength(16);
        });

        it('doesn’t warn at 15', async () => {
          const { sideboardPicks, yours } = sideboardOf(15);
          const { page } = await openExport(sideboardPicks, {}, { plan: yours });

          expect(warning(page)).toBeNull();
        });

        it('doesn’t warn on an MTGO draft', async () => {
          const { sideboardPicks, yours } = sideboardOf(16);
          const { page } = await openExport(sideboardPicks, { platform: 'MTGO' }, { plan: yours });

          expect(warning(page)).toBeNull();
        });
      });
    });

    it('reports a failed copy for Moxfield when the clipboard refuses', async () => {
      writeText.mockRejectedValue(new Error('denied'));
      const opened = await openExport(picks);

      await copyFor(opened, 'Moxfield');

      expect(alertIn(panel(opened.page))?.textContent).toContain("Couldn't copy");
      expect(announced(opened.page)).toBe('');
      expect(shownLabel(copyButton(opened.page, 'Moxfield')!)).toBe('Copy for Moxfield');
    });

    it('reports a failed copy for Arena when the clipboard refuses', async () => {
      writeText.mockRejectedValue(new Error('denied'));
      const opened = await openExport(picks);

      await copyFor(opened);

      expect(alertIn(panel(opened.page))?.textContent).toContain("Couldn't copy");
      expect(announced(opened.page)).toBe('');
      expect(shownLabel(copyButton(opened.page)!)).toBe('Copy for Arena');
    });

    it('confirms a copy on the clicked button, with a checkmark', async () => {
      const opened = await openExport(picks);
      const { page } = opened;

      await copyFor(opened);

      expect(shownLabel(copyButton(page)!)).toBe('Copied');
      expect(copyButton(page)!.querySelector('svg')).not.toBeNull();
      expect(shownLabel(copyButton(page, 'Moxfield')!)).toBe('Copy for Moxfield');
      expect(copyButton(page, 'Moxfield')!.querySelector('svg')).toBeNull();
    });

    describe('over time', () => {
      afterEach(() => vi.useRealTimers());

      /** Opens the Export tab, then takes over the clock. */
      async function openExportWithClock() {
        const opened = await openExport(picks);
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        return opened;
      }

      /** Lets `ms` pass, then shows what changed. */
      async function pass(fixture: { whenStable(): Promise<unknown> }, ms: number) {
        vi.advanceTimersByTime(ms);
        await fixture.whenStable();
      }

      it('returns the button to its label after 2 seconds', async () => {
        const { fixture, page } = await openExportWithClock();
        copyButton(page)!.click();
        await fixture.whenStable();

        await pass(fixture, 1999);
        expect(shownLabel(copyButton(page)!)).toBe('Copied');

        await pass(fixture, 1);
        expect(shownLabel(copyButton(page)!)).toBe('Copy for Arena');
        expect(announced(page)).toBe('');
      });

      it('copies again and restarts the 2 seconds when clicked while confirmed', async () => {
        const { fixture, page } = await openExportWithClock();
        copyButton(page)!.click();
        await fixture.whenStable();
        await pass(fixture, 1500);

        copyButton(page)!.click();
        await fixture.whenStable();
        expect(writeText).toHaveBeenCalledTimes(2);

        await pass(fixture, 1999);
        expect(shownLabel(copyButton(page)!)).toBe('Copied');
        await pass(fixture, 1);
        expect(shownLabel(copyButton(page)!)).toBe('Copy for Arena');
      });

      it('confirms only the latest copy, for its own 2 seconds', async () => {
        const { fixture, page } = await openExportWithClock();
        copyButton(page)!.click();
        await fixture.whenStable();
        await pass(fixture, 1500);

        copyButton(page, 'Moxfield')!.click();
        await fixture.whenStable();

        expect(shownLabel(copyButton(page)!)).toBe('Copy for Arena');
        expect(shownLabel(copyButton(page, 'Moxfield')!)).toBe('Copied');
        expect(announced(page)).toBe('Copied for Moxfield');

        await pass(fixture, 1999);
        expect(shownLabel(copyButton(page, 'Moxfield')!)).toBe('Copied');
      });

      it('returns the first button to its label while the other button is still copying', async () => {
        const { fixture, page } = await openExportWithClock();
        copyButton(page)!.click();
        await fixture.whenStable();

        writeText.mockReturnValue(new Promise(() => {}));
        copyButton(page, 'Moxfield')!.click();
        await fixture.whenStable();

        expect(shownLabel(copyButton(page)!)).toBe('Copy for Arena');
      });

      it.each(['Pool', 'Queue', 'Board'] as const)(
        'clears the confirmation when the %s tab closes the panel',
        async (tab) => {
          const { fixture, page } = await openExportWithClock();
          copyButton(page)!.click();
          await fixture.whenStable();

          tabButton(page, tab).click();
          await fixture.whenStable();

          expect(shownLabel(exportCopyButton(page))).toBe('Copy for Arena');
          expect(announced(page)).toBe('');
        },
      );

      it('does not confirm a copy that finishes after the panel has closed', async () => {
        let finishCopy = () => {};
        writeText.mockReturnValue(new Promise((resolve) => (finishCopy = resolve)));
        const { fixture, page } = await openExportWithClock();
        copyButton(page)!.click();
        await fixture.whenStable();

        tabButton(page, 'Pool').click();
        await fixture.whenStable();
        finishCopy();
        await writeText.mock.results[0]?.value;
        await fixture.whenStable();

        expect(shownLabel(exportCopyButton(page))).toBe('Copy for Arena');
      });
    });

    /** Has each copy from now on wait until the test settles it, and returns their settlers in order. */
    function holdCopies() {
      const held: { resolve: () => void; reject: (err: Error) => void }[] = [];
      writeText.mockImplementation(
        () => new Promise<void>((resolve, reject) => held.push({ resolve, reject })),
      );
      return held;
    }

    /** Lets the `index`th copy, once settled, report how it went. */
    async function settled(opened: { fixture: { whenStable(): Promise<unknown> } }, index: number) {
      await Promise.allSettled([writeText.mock.results[index]!.value]);
      await opened.fixture.whenStable();
    }

    it('shows no copy failure on opening the Export tab straight from its URL', async () => {
      const { page } = await openDraft(
        completeSnapshot,
        {
          state: 'Drafting',
          players: [bob, alicePlayer],
          turn: { pick: 4, round: 2, playerId: bob.id },
        },
        { cards: cardsOf(picks), picks: picksOf(picks), url: '/drafts/draft-1?tab=export' },
      );

      expect(panelName(page)).toBe('Export');
      expect(alertIn(panel(page))).toBeNull();
    });

    it('keeps the button confirmed, without a flicker, while it copies again', async () => {
      const opened = await openExport(picks);
      await copyFor(opened);
      expect(shownLabel(copyButton(opened.page)!)).toBe('Copied');

      holdCopies();
      await copyFor(opened);

      expect(shownLabel(copyButton(opened.page)!)).toBe('Copied');
    });

    it('takes the confirmation off a confirmed button whose next copy fails', async () => {
      const opened = await openExport(picks);
      await copyFor(opened);
      expect(shownLabel(copyButton(opened.page)!)).toBe('Copied');

      writeText.mockRejectedValue(new Error('denied'));
      await copyFor(opened);

      expect(alertIn(panel(opened.page))).not.toBeNull();
      expect(shownLabel(copyButton(opened.page)!)).toBe('Copy for Arena');
    });

    it('ignores an earlier copy failing once a later one has started', async () => {
      const opened = await openExport(picks);
      const held = holdCopies();
      await copyFor(opened);
      await copyFor(opened, 'Moxfield');
      held[1].resolve();
      await settled(opened, 1);

      held[0].reject(new Error('denied'));
      await settled(opened, 0);

      expect(alertIn(panel(opened.page))).toBeNull();
      expect(shownLabel(copyButton(opened.page, 'Moxfield')!)).toBe('Copied');
    });

    it('ignores a copy failing after the panel has closed', async () => {
      const opened = await openExport(picks);
      const held = holdCopies();
      await copyFor(opened);

      tabButton(opened.page, 'Pool').click();
      await opened.fixture.whenStable();
      held[0].reject(new Error('denied'));
      await settled(opened, 0);

      expect(alertIn(exportPanel(opened.page))).toBeNull();
    });

    it('confirms none of the copies started before the panel closed and opened again', async () => {
      const opened = await openExport(picks);
      const held = holdCopies();
      await copyFor(opened);
      await copyFor(opened);
      tabButton(opened.page, 'Pool').click();
      await opened.fixture.whenStable();
      tabButton(opened.page, 'Export').click();
      await opened.fixture.whenStable();
      await copyFor(opened);

      held[0].resolve();
      await settled(opened, 0);

      expect(shownLabel(copyButton(opened.page)!)).toBe('Copy for Arena');
    });

    it('clears the failure alert on the next copy attempt', async () => {
      writeText.mockRejectedValueOnce(new Error('denied'));
      const opened = await openExport(picks);
      await copyFor(opened);

      await copyFor(opened);

      expect(alertIn(panel(opened.page))).toBeNull();
      expect(shownLabel(copyButton(opened.page)!)).toBe('Copied');
    });

    it('clears the failure alert when a tab closes the panel', async () => {
      writeText.mockRejectedValue(new Error('denied'));
      const opened = await openExport(picks);
      await copyFor(opened);

      tabButton(opened.page, 'Pool').click();
      await opened.fixture.whenStable();

      expect(alertIn(exportPanel(opened.page))).toBeNull();
    });

    it('offers nothing to copy when you have no picks', async () => {
      const { page } = await openExport([picks[0]!]);

      expect(copyButton(page)).toBeUndefined();
    });
  });
});
