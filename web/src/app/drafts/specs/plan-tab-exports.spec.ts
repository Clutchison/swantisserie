import { TestBed } from '@angular/core/testing';
import type { PickView, PlanView, PoolCardView } from 'contract';
import {
  collapseWhitespace,
  menu,
  menuItem,
  menuItems,
  openMenu,
  pressEscape,
  pressKey,
} from '../../specs-harness';
import type { PickedCard } from '../draft-store';
import type { ExportTarget } from '../export-buttons';
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
  panelName,
  openDraft,
  flushPool,
  flushQueue,
  flushQueueAndPlan,
  completeSnapshot,
  type DraftFixture,
  pickOf,
  poolCardOf,
  text,
  alertIn,
  button,
  buttonOrder,
  accessibleName,
} from './harness';
import {
  copyButton,
  openPlan,
  planPanel,
  sideboardNotice,
} from './plan-tab-harness';
import { playing, threePlayers, withTournament } from './play-tab-harness';

useDraftsApp();

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

/** What the Copy button reads as: its confirmation, once it has one, or else its label. */
const shownLabel = (copy: HTMLElement) => collapseWhitespace(accessibleName(copy));
/** What the Copy button's hidden status region announces: "Copied for …", or nothing. */
const announced = (root: HTMLElement) =>
  [...planPanel(root).querySelectorAll<HTMLElement>('[role="status"]')]
    .map(text)
    .find((said) => said.startsWith('Copied for')) ?? '';

/** An open draft page, for the helpers that act on it. */
type Opened = { fixture: { whenStable(): Promise<unknown> }; page: HTMLElement };

describe('Deck tab exports', () => {
  const picks: PickedCard[] = [
    imaPick(1, bob.id, 'shock-card', 'Shock'),
    imaPick(2, alice.id, 'bolt-card', 'Lightning Bolt'),
    imaPick(3, alice.id, 'spike-card', 'Lava Spike'),
  ];

  /** Opens the draft, Bob then Alice, on the Deck tab. */
  async function openPlanWith(
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
    await openPlan(opened.fixture, opened.page);
    return opened;
  }

  /** Opens the Deck tab with your picks and plan answered, and the pool left for the test to answer. */
  async function openPlanPoolUnanswered() {
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
    tabButton(page, 'Deck').click();
    await vi.waitFor(() => {
      TestBed.tick();
      expect(panelName(page)).toBe('Deck');
    });
    return { fixture, page, poolReq };
  }

  it('offers nothing to copy until the pool arrives', async () => {
    const { fixture, page, poolReq } = await openPlanPoolUnanswered();
    expect(copyButton(page)).toBeUndefined();

    poolReq.flush(cardsOf(picks));
    await fixture.whenStable();

    expect(copyButton(page)).toBeDefined();
  });

  it('offers nothing to copy when the pool failed', async () => {
    const { fixture, page, poolReq } = await openPlanPoolUnanswered();

    poolReq.flush(null, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();

    expect(copyButton(page)).toBeUndefined();
  });

  it('offers nothing to copy when you have no picks', async () => {
    const { page } = await openPlanWith([picks[0]!]);

    expect(copyButton(page)).toBeUndefined();
  });

  it('has no Export tab', async () => {
    const { page } = await openPlanWith(picks);

    expect(
      [...page.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent?.trim()),
    ).not.toContain('Export');
  });

  describe('copying your deck', () => {
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
    async function copyFor(opened: Opened, target: ExportTarget = 'Arena') {
      if (!menu('Copy')) openMenu(copyButton(opened.page)!, 'Copy');
      menuItem('Copy', target)!.click();
      await opened.fixture.whenStable();
      return writeText.mock.lastCall?.[0];
    }

    it('offers Copy last in the tools row, after Queue unpicked and Add basics', async () => {
      const unpicked = { poolCardId: 'brainstorm-card', name: 'Brainstorm', picked: false };
      const opened = await openPlanWith(
        picks,
        {},
        { plan: { ...EMPTY_PLAN, mainboard: [unpicked] } },
      );
      button(planPanel(opened.page), 'Stacks')!.click();
      await opened.fixture.whenStable();

      // Only the row's action buttons: the mode and Group by toggles have no order to keep.
      const actions = ['Queue unpicked', 'Add basics', 'Copy'];
      expect(
        buttonOrder(planPanel(opened.page), 'Copy').filter((name) => actions.includes(name)),
      ).toEqual(actions);
    });

    it('opens a Copy menu of Arena and Moxfield on an Arena draft', async () => {
      const opened = await openPlanWith(picks, { platform: 'Arena' });

      expect(menu('Copy')).toBeNull();
      expect(openMenu(copyButton(opened.page)!, 'Copy')).toEqual(['Arena', 'Moxfield']);
    });

    it('opens a Copy menu of MTGO and Moxfield on an MTGO draft', async () => {
      const opened = await openPlanWith(picks, { platform: 'MTGO' });

      expect(openMenu(copyButton(opened.page)!, 'Copy')).toEqual(['MTGO', 'Moxfield']);
    });

    it('opens the Copy menu from the keyboard, focusing its first item', async () => {
      const opened = await openPlanWith(picks);

      pressKey(copyButton(opened.page)!, 'ArrowDown');
      await opened.fixture.whenStable();

      expect(menuItems('Copy')).toEqual(['Arena', 'Moxfield']);
      expect(document.activeElement).toBe(menuItem('Copy', 'Arena'));
    });

    it('closes the Copy menu on Escape, returning focus to Copy, without copying', async () => {
      const opened = await openPlanWith(picks);
      pressKey(copyButton(opened.page)!, 'ArrowDown');
      await opened.fixture.whenStable();

      pressEscape();
      await opened.fixture.whenStable();

      expect(menu('Copy')).toBeNull();
      expect(document.activeElement).toBe(copyButton(opened.page));
      expect(writeText).not.toHaveBeenCalled();
    });

    it('copies the item chosen from the keyboard, returning focus to Copy', async () => {
      const opened = await openPlanWith(picks);
      pressKey(copyButton(opened.page)!, 'ArrowDown');
      await opened.fixture.whenStable();

      pressKey(menuItem('Copy', 'Arena')!, 'ArrowDown');
      pressKey(menuItem('Copy', 'Moxfield')!, 'Enter');
      await opened.fixture.whenStable();

      expect(writeText.mock.lastCall?.[0]).toBe('1 Lightning Bolt (IMA) 1\n1 Lava Spike (IMA) 1');
      expect(menu('Copy')).toBeNull();
      expect(document.activeElement).toBe(copyButton(opened.page));
      await vi.waitFor(() => {
        TestBed.tick();
        expect(announced(opened.page)).toBe('Copied for Moxfield');
      });
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
        const opened = await openPlanWith(multiFace);

        expect(await copyFor(opened)).toBe(
          'Deck\n1 Shock\n1 Bonecrusher Giant\n1 Commit // Memory',
        );
        expect(announced(opened.page)).toBe('Copied for Arena');
      });

      it('copies your picks for MTGO, with multi-face cards named its way', async () => {
        const opened = await openPlanWith(multiFace, { platform: 'MTGO' });

        expect(await copyFor(opened, 'MTGO')).toBe('1 Shock\n1 Bonecrusher Giant\n1 Commit/Memory');
        expect(announced(opened.page)).toBe('Copied for MTGO');
      });

      it('copies your picks for Moxfield, with their printings', async () => {
        const opened = await openPlanWith(multiFace);

        expect(await copyFor(opened, 'Moxfield')).toBe(
          '1 Shock (M21) 159\n1 Bonecrusher Giant // Stomp (ELD) 115\n1 Commit // Memory (AKH) 211',
        );
        expect(announced(opened.page)).toBe('Copied for Moxfield');
      });
    });

    describe('from your deck', () => {
      const yourPicks: PickedCard[] = [
        imaPick(1, alice.id, 'shock-card', 'Shock'),
        imaPick(2, bob.id, 'spike-card', 'Lava Spike'),
        imaPick(3, alice.id, 'bolt-card', 'Lightning Bolt'),
        imaPick(5, alice.id, 'opt-card', 'Opt'),
        imaPick(7, alice.id, 'shock-card-2', 'Shock'),
      ];
      /**
       * Bolt and a Shock on the mainboard with basics, Opt, the other Shock
       * and two Plains on the sideboard, and an unpicked card on each. Its
       * player prefers Kaldheim's Island #395, which no export names.
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
          { land: 'Island', board: 'Mainboard', count: 8 },
          { land: 'Mountain', board: 'Mainboard', count: 7 },
          { land: 'Plains', board: 'Sideboard', count: 2 },
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
      /** `plan` as a complete draft or a locked deck holds it: without its unpicked cards. */
      const deck: PlanView = {
        ...plan,
        mainboard: plan.mainboard.filter((card) => card.picked),
        sideboard: plan.sideboard.filter((card) => card.picked),
      };

      it('copies it for Arena: the mainboard and its basics, then the sideboard and its basics, without unpicked cards', async () => {
        const opened = await openPlanWith(yourPicks, {}, { plan });

        expect(await copyFor(opened)).toBe(
          'Deck\n1 Shock\n1 Lightning Bolt\n8 Island\n7 Mountain\n\nSideboard\n1 Opt\n1 Shock\n2 Plains',
        );
      });

      it('copies it for MTGO: the mainboard and its basics, a blank line, then the sideboard and its basics', async () => {
        const opened = await openPlanWith(yourPicks, { platform: 'MTGO' }, { plan });

        expect(await copyFor(opened, 'MTGO')).toBe(
          '1 Shock\n1 Lightning Bolt\n8 Island\n7 Mountain\n\n1 Opt\n1 Shock\n2 Plains',
        );
      });

      it('copies it for Moxfield: the mainboard and its basics, then the sideboard and its basics', async () => {
        const opened = await openPlanWith(yourPicks, {}, { plan });

        expect(await copyFor(opened, 'Moxfield')).toBe(
          '1 Shock (IMA) 1\n1 Lightning Bolt (IMA) 1\n8 Island\n7 Mountain\n\nSIDEBOARD:\n1 Opt (IMA) 1\n1 Shock (IMA) 1\n2 Plains',
        );
      });

      it('copies a complete draft’s deck, which holds no unpicked cards', async () => {
        const opened = await openPlanWith(
          yourPicks,
          { state: 'Complete', turn: null },
          { plan: deck },
        );

        expect(await copyFor(opened)).toBe(
          'Deck\n1 Shock\n1 Lightning Bolt\n8 Island\n7 Mountain\n\nSideboard\n1 Opt\n1 Shock\n2 Plains',
        );
      });

      it('copies a locked deck, as its player’s tournament is playing', async () => {
        const tournament = playing();
        const opened = await openPlanWith(yourPicks, withTournament(tournament, threePlayers), {
          plan: deck,
          tournament,
        });
        expect(text(planPanel(opened.page))).toContain('Your deck is locked');
        expect(button(planPanel(opened.page), 'Add basics')).toBeUndefined();
        expect(openMenu(copyButton(opened.page)!, 'Copy')).toEqual(['Arena', 'Moxfield']);

        expect(await copyFor(opened)).toBe(
          'Deck\n1 Shock\n1 Lightning Bolt\n8 Island\n7 Mountain\n\nSideboard\n1 Opt\n1 Shock\n2 Plains',
        );
        expect(announced(opened.page)).toBe('Copied for Arena');
      });

      it('copies a deck with an empty sideboard as it copies every pick', async () => {
        const opened = await openPlanWith(
          yourPicks,
          {},
          { plan: { ...EMPTY_PLAN, mainboard: plan.mainboard } },
        );

        expect(await copyFor(opened)).toBe('Deck\n2 Shock\n1 Lightning Bolt\n1 Opt');
      });

      it('offers nothing to copy while your deck is still on its way', async () => {
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
        tabButton(page, 'Deck').click();
        TestBed.tick();

        expect(copyButton(page)).toBeUndefined();
        planRequest.flush(plan);
        await fixture.whenStable();
        expect(copyButton(page)).toBeDefined();
      });

      it('offers nothing to copy when your deck couldn’t be loaded', async () => {
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
        await openPlan(fixture, page);

        expect(alertIn(planPanel(page))?.textContent).toContain("Couldn't load your deck");
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

        it('warns at the top of the Deck tab that Arena may keep only 15, and still exports every card', async () => {
          const { sideboardPicks, yours } = sideboardOf(16);
          const opened = await openPlanWith(sideboardPicks, {}, { plan: yours });

          const notice = sideboardNotice(opened.page)!;
          expect(text(notice)).toBe(
            "Your sideboard has 16 cards. Arena's import may keep only 15 of them, though your export has them all.",
          );
          // Among the notices, before the controls row.
          expect(
            notice.compareDocumentPosition(button(planPanel(opened.page), 'Add basics')!) &
              Node.DOCUMENT_POSITION_FOLLOWING,
          ).toBeTruthy();
          const copied = (await copyFor(opened))!.split('\n');
          expect(copied.slice(copied.indexOf('Sideboard') + 1)).toHaveLength(16);
        });

        it('counts the sideboard’s basics toward Arena’s 15', async () => {
          const { sideboardPicks, yours } = sideboardOf(14);
          const { page } = await openPlanWith(
            sideboardPicks,
            {},
            { plan: { ...yours, basics: [{ land: 'Island', board: 'Sideboard', count: 2 }] } },
          );

          expect(text(sideboardNotice(page)!)).toContain('Your sideboard has 16 cards.');
        });

        it('doesn’t warn at 15', async () => {
          const { sideboardPicks, yours } = sideboardOf(15);
          const { page } = await openPlanWith(sideboardPicks, {}, { plan: yours });

          expect(sideboardNotice(page)).toBeUndefined();
        });

        it('doesn’t warn on an MTGO draft', async () => {
          const { sideboardPicks, yours } = sideboardOf(16);
          const { page } = await openPlanWith(
            sideboardPicks,
            { platform: 'MTGO' },
            { plan: yours },
          );

          expect(sideboardNotice(page)).toBeUndefined();
        });
      });
    });

    it('reports a failed copy for Moxfield when the clipboard refuses', async () => {
      writeText.mockRejectedValue(new Error('denied'));
      const opened = await openPlanWith(picks);

      await copyFor(opened, 'Moxfield');

      expect(alertIn(planPanel(opened.page))?.textContent).toContain("Couldn't copy");
      expect(announced(opened.page)).toBe('');
      expect(shownLabel(copyButton(opened.page)!)).toBe('Copy');
    });

    it('reports a failed copy for Arena when the clipboard refuses', async () => {
      writeText.mockRejectedValue(new Error('denied'));
      const opened = await openPlanWith(picks);

      await copyFor(opened);

      expect(alertIn(planPanel(opened.page))?.textContent).toContain("Couldn't copy");
      expect(announced(opened.page)).toBe('');
      expect(shownLabel(copyButton(opened.page)!)).toBe('Copy');
    });

    it('closes the menu and confirms a copy on the Copy button', async () => {
      const opened = await openPlanWith(picks);
      const { page } = opened;
      expect(shownLabel(copyButton(page)!)).toBe('Copy');

      await copyFor(opened);

      expect(menu('Copy')).toBeNull();
      expect(shownLabel(copyButton(page)!)).toBe('Copied');
    });

    describe('over time', () => {
      afterEach(() => vi.useRealTimers());

      /** Opens the Deck tab, then takes over the clock. */
      async function openPlanWithClock() {
        const opened = await openPlanWith(picks);
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        return opened;
      }

      /** Lets `ms` pass, then shows what changed. */
      async function pass(fixture: { whenStable(): Promise<unknown> }, ms: number) {
        vi.advanceTimersByTime(ms);
        await fixture.whenStable();
      }

      it('returns the button to its label after 2 seconds', async () => {
        const { fixture, page } = await openPlanWithClock();
        await copyFor({ fixture, page });

        await pass(fixture, 1999);
        expect(shownLabel(copyButton(page)!)).toBe('Copied');

        await pass(fixture, 1);
        expect(shownLabel(copyButton(page)!)).toBe('Copy');
        expect(announced(page)).toBe('');
      });

      it('copies again and restarts the 2 seconds when copied again while confirmed', async () => {
        const { fixture, page } = await openPlanWithClock();
        await copyFor({ fixture, page });
        await pass(fixture, 1500);

        await copyFor({ fixture, page });
        expect(writeText).toHaveBeenCalledTimes(2);

        await pass(fixture, 1999);
        expect(shownLabel(copyButton(page)!)).toBe('Copied');
        await pass(fixture, 1);
        expect(shownLabel(copyButton(page)!)).toBe('Copy');
      });

      it('confirms only the latest copy, for its own 2 seconds', async () => {
        const { fixture, page } = await openPlanWithClock();
        await copyFor({ fixture, page });
        await pass(fixture, 1500);

        await copyFor({ fixture, page }, 'Moxfield');

        expect(shownLabel(copyButton(page)!)).toBe('Copied');
        expect(announced(page)).toBe('Copied for Moxfield');

        await pass(fixture, 1999);
        expect(shownLabel(copyButton(page)!)).toBe('Copied');
        await pass(fixture, 1);
        expect(shownLabel(copyButton(page)!)).toBe('Copy');
      });

      it('takes the confirmation off while a copy for another export is still copying', async () => {
        const { fixture, page } = await openPlanWithClock();
        await copyFor({ fixture, page });

        writeText.mockReturnValue(new Promise(() => {}));
        await copyFor({ fixture, page }, 'Moxfield');

        expect(shownLabel(copyButton(page)!)).toBe('Copy');
        expect(announced(page)).toBe('');
      });

      it.each(['Pool', 'Queue', 'Board'] as const)(
        'clears the confirmation when the %s tab closes the panel',
        async (tab) => {
          const { fixture, page } = await openPlanWithClock();
          await copyFor({ fixture, page });

          tabButton(page, tab).click();
          await fixture.whenStable();

          expect(shownLabel(copyButton(page)!)).toBe('Copy');
          expect(announced(page)).toBe('');
        },
      );

      it('does not confirm a copy that finishes after the panel has closed', async () => {
        let finishCopy = () => {};
        writeText.mockReturnValue(new Promise((resolve) => (finishCopy = resolve)));
        const { fixture, page } = await openPlanWithClock();
        await copyFor({ fixture, page });

        tabButton(page, 'Pool').click();
        await fixture.whenStable();
        finishCopy();
        await writeText.mock.results[0]?.value;
        await fixture.whenStable();

        expect(shownLabel(copyButton(page)!)).toBe('Copy');
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

    it('shows no copy failure on opening the Deck tab straight from its URL', async () => {
      const { page } = await openDraft(
        completeSnapshot,
        {
          state: 'Drafting',
          players: [bob, alicePlayer],
          turn: { pick: 4, round: 2, playerId: bob.id },
        },
        { cards: cardsOf(picks), picks: picksOf(picks), url: '/drafts/draft-1?tab=deck' },
      );

      expect(panelName(page)).toBe('Deck');
      expect(copyButton(page)).toBeDefined();
      expect(alertIn(planPanel(page))).toBeNull();
    });

    it('keeps the button confirmed, without a flicker, while it copies again', async () => {
      const opened = await openPlanWith(picks);
      await copyFor(opened);
      expect(shownLabel(copyButton(opened.page)!)).toBe('Copied');

      holdCopies();
      await copyFor(opened);

      expect(shownLabel(copyButton(opened.page)!)).toBe('Copied');
    });

    it('takes the confirmation off a confirmed button whose next copy fails', async () => {
      const opened = await openPlanWith(picks);
      await copyFor(opened);
      expect(shownLabel(copyButton(opened.page)!)).toBe('Copied');

      writeText.mockRejectedValue(new Error('denied'));
      await copyFor(opened);

      expect(alertIn(planPanel(opened.page))).not.toBeNull();
      expect(shownLabel(copyButton(opened.page)!)).toBe('Copy');
    });

    it('ignores an earlier copy failing once a later one has started', async () => {
      const opened = await openPlanWith(picks);
      const held = holdCopies();
      await copyFor(opened);
      await copyFor(opened, 'Moxfield');
      held[1].resolve();
      await settled(opened, 1);

      held[0].reject(new Error('denied'));
      await settled(opened, 0);

      expect(alertIn(planPanel(opened.page))).toBeNull();
      expect(shownLabel(copyButton(opened.page)!)).toBe('Copied');
    });

    it('ignores a copy failing after the panel has closed', async () => {
      const opened = await openPlanWith(picks);
      const held = holdCopies();
      await copyFor(opened);

      tabButton(opened.page, 'Pool').click();
      await opened.fixture.whenStable();
      held[0].reject(new Error('denied'));
      await settled(opened, 0);

      expect(alertIn(planPanel(opened.page))).toBeNull();
    });

    it('confirms none of the copies started before the panel closed and opened again', async () => {
      const opened = await openPlanWith(picks);
      const held = holdCopies();
      await copyFor(opened);
      await copyFor(opened);
      tabButton(opened.page, 'Pool').click();
      await opened.fixture.whenStable();
      await openPlan(opened.fixture, opened.page);
      await copyFor(opened);

      held[0].resolve();
      await settled(opened, 0);

      expect(shownLabel(copyButton(opened.page)!)).toBe('Copy');
    });

    it('clears the failure alert on the next copy attempt', async () => {
      writeText.mockRejectedValueOnce(new Error('denied'));
      const opened = await openPlanWith(picks);
      await copyFor(opened);

      await copyFor(opened);

      expect(alertIn(planPanel(opened.page))).toBeNull();
      expect(shownLabel(copyButton(opened.page)!)).toBe('Copied');
    });

    it('clears the failure alert when a tab closes the panel', async () => {
      writeText.mockRejectedValue(new Error('denied'));
      const opened = await openPlanWith(picks);
      await copyFor(opened);

      tabButton(opened.page, 'Pool').click();
      await opened.fixture.whenStable();

      expect(alertIn(planPanel(opened.page))).toBeNull();
    });
  });
});
