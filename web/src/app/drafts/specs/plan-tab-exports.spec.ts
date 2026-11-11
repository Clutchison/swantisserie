import { TestBed } from '@angular/core/testing';
import type { PickView, PlanView, PoolCardView } from 'contract';
import { byAriaLabel } from '../../specs-harness';
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
  copyButton as copyButtonIn,
  deckPanel,
  sideboardNotice as sideboardNoticeIn,
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

/** The Deck tab's copy buttons, with their live region and clipboard error. */
const exportsGroup = (root: HTMLElement) =>
  byAriaLabel(deckPanel(root), '[role="group"]', 'Exports');

/** A copy button on the Deck tab, by the export it copies, whatever it shows. */
const copyButton = (root: HTMLElement, target: ExportTarget = 'Arena') =>
  copyButtonIn(deckPanel(root), target);
/** What a copy button reads as: its confirmation, once it has one, or else its label. */
const shownLabel = (copy: HTMLElement) => accessibleName(copy).replace(/\s+/g, ' ').trim();
/** What the copy buttons' hidden status region announces. */
const announced = (root: HTMLElement) =>
  exportsGroup(root)?.querySelector('[role="status"]')?.textContent?.trim();
/** Arena's sideboard-cap notice on the Deck tab; undefined if none shows. */
const sideboardNotice = (root: HTMLElement) => sideboardNoticeIn(deckPanel(root));

describe('Deck tab exports', () => {
  const picks: PickedCard[] = [
    imaPick(1, bob.id, 'shock-card', 'Shock'),
    imaPick(2, alice.id, 'bolt-card', 'Lightning Bolt'),
    imaPick(3, alice.id, 'spike-card', 'Lava Spike'),
  ];

  /** Opens the draft, Bob then Alice, on the Deck tab. */
  async function openDeck(
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
    tabButton(opened.page, 'Deck').click();
    await opened.fixture.whenStable();
    return opened;
  }

  /** Opens the Deck tab with your picks and plan answered, and the pool left for the test to answer. */
  async function openDeckPoolUnanswered() {
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
    const { fixture, page, poolReq } = await openDeckPoolUnanswered();
    expect(copyButton(page)).toBeUndefined();

    poolReq.flush(cardsOf(picks));
    await fixture.whenStable();

    expect(copyButton(page)).toBeDefined();
  });

  it('offers nothing to copy when the pool failed', async () => {
    const { fixture, page, poolReq } = await openDeckPoolUnanswered();

    poolReq.flush(null, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();

    expect(copyButton(page)).toBeUndefined();
  });

  it('offers nothing to copy when you have no picks', async () => {
    const { page } = await openDeck([picks[0]!]);

    expect(copyButton(page)).toBeUndefined();
  });

  it('has no Export tab', async () => {
    const { page } = await openDeck(picks);

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
    async function copyFor(
      opened: { fixture: { whenStable(): Promise<unknown> }; page: HTMLElement },
      target: ExportTarget = 'Arena',
    ) {
      copyButton(opened.page, target)!.click();
      await opened.fixture.whenStable();
      return writeText.mock.lastCall?.[0];
    }

    /** The Deck tab's controls row from Add basics on. */
    const fromAddBasics = (root: HTMLElement) => {
      const row = buttonOrder(deckPanel(root), 'Add basics');
      return row.slice(row.indexOf('Add basics'));
    };

    it('offers copies for Arena and Moxfield on an Arena draft, after Add basics', async () => {
      const { page } = await openDeck(picks, { platform: 'Arena' });

      expect(fromAddBasics(page)).toEqual(['Add basics', 'Copy for Arena', 'Copy for Moxfield']);
    });

    it('offers copies for MTGO and Moxfield on an MTGO draft, after Add basics', async () => {
      const { page } = await openDeck(picks, { platform: 'MTGO' });

      expect(fromAddBasics(page)).toEqual(['Add basics', 'Copy for MTGO', 'Copy for Moxfield']);
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
        const opened = await openDeck(multiFace);

        expect(await copyFor(opened)).toBe(
          'Deck\n1 Shock\n1 Bonecrusher Giant\n1 Commit // Memory',
        );
        expect(announced(opened.page)).toBe('Copied for Arena');
      });

      it('copies your picks for MTGO, with multi-face cards named its way', async () => {
        const opened = await openDeck(multiFace, { platform: 'MTGO' });

        expect(await copyFor(opened, 'MTGO')).toBe('1 Shock\n1 Bonecrusher Giant\n1 Commit/Memory');
        expect(announced(opened.page)).toBe('Copied for MTGO');
      });

      it('copies your picks for Moxfield, with their printings', async () => {
        const opened = await openDeck(multiFace);

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

      const openPlanDeck = (fields: DraftFixture = {}, yours = plan) =>
        openDeck(yourPicks, fields, { plan: yours });

      it('copies it for Arena: the mainboard and its basics, then the sideboard and its basics, without unpicked cards', async () => {
        const opened = await openPlanDeck();

        expect(await copyFor(opened)).toBe(
          'Deck\n1 Shock\n1 Lightning Bolt\n8 Island\n7 Mountain\n\nSideboard\n1 Opt\n1 Shock\n2 Plains',
        );
      });

      it('copies it for MTGO: the mainboard and its basics, a blank line, then the sideboard and its basics', async () => {
        const opened = await openPlanDeck({ platform: 'MTGO' });

        expect(await copyFor(opened, 'MTGO')).toBe(
          '1 Shock\n1 Lightning Bolt\n8 Island\n7 Mountain\n\n1 Opt\n1 Shock\n2 Plains',
        );
      });

      it('copies it for Moxfield: the mainboard and its basics, then the sideboard and its basics', async () => {
        const opened = await openPlanDeck();

        expect(await copyFor(opened, 'Moxfield')).toBe(
          '1 Shock (IMA) 1\n1 Lightning Bolt (IMA) 1\n8 Island\n7 Mountain\n\nSIDEBOARD:\n1 Opt (IMA) 1\n1 Shock (IMA) 1\n2 Plains',
        );
      });

      it('copies a complete draft’s deck, which holds no unpicked cards', async () => {
        const opened = await openPlanDeck({ state: 'Complete', turn: null }, deck);

        expect(await copyFor(opened)).toBe(
          'Deck\n1 Shock\n1 Lightning Bolt\n8 Island\n7 Mountain\n\nSideboard\n1 Opt\n1 Shock\n2 Plains',
        );
      });

      it('copies a locked deck, as its player’s tournament is playing', async () => {
        const tournament = playing();
        const opened = await openDeck(yourPicks, withTournament(tournament, threePlayers), {
          plan: deck,
          tournament,
        });
        expect(text(deckPanel(opened.page))).toContain('Your deck is locked');
        expect(button(deckPanel(opened.page), 'Add basics')).toBeUndefined();
        expect(buttonOrder(deckPanel(opened.page), 'Copy for Arena')).toEqual([
          'Copy for Arena',
          'Copy for Moxfield',
        ]);

        expect(await copyFor(opened)).toBe(
          'Deck\n1 Shock\n1 Lightning Bolt\n8 Island\n7 Mountain\n\nSideboard\n1 Opt\n1 Shock\n2 Plains',
        );
        expect(announced(opened.page)).toBe('Copied for Arena');
      });

      it('copies a deck with an empty sideboard as it copies every pick', async () => {
        const opened = await openPlanDeck({}, { ...EMPTY_PLAN, mainboard: plan.mainboard });

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
        tabButton(page, 'Deck').click();
        await fixture.whenStable();

        expect(alertIn(deckPanel(page))?.textContent).toContain("Couldn't load your deck");
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
          const opened = await openDeck(sideboardPicks, {}, { plan: yours });

          const notice = sideboardNotice(opened.page)!;
          expect(text(notice)).toBe(
            "Your sideboard has 16 cards. Arena's import may keep only 15 of them, though your export has them all.",
          );
          // Among the notices, before the controls row.
          expect(
            notice.compareDocumentPosition(button(deckPanel(opened.page), 'Add basics')!) &
              Node.DOCUMENT_POSITION_FOLLOWING,
          ).toBeTruthy();
          const copied = (await copyFor(opened))!.split('\n');
          expect(copied.slice(copied.indexOf('Sideboard') + 1)).toHaveLength(16);
        });

        it('counts the sideboard’s basics toward Arena’s 15', async () => {
          const { sideboardPicks, yours } = sideboardOf(14);
          const { page } = await openDeck(
            sideboardPicks,
            {},
            { plan: { ...yours, basics: [{ land: 'Island', board: 'Sideboard', count: 2 }] } },
          );

          expect(text(sideboardNotice(page)!)).toContain('Your sideboard has 16 cards.');
        });

        it('doesn’t warn at 15', async () => {
          const { sideboardPicks, yours } = sideboardOf(15);
          const { page } = await openDeck(sideboardPicks, {}, { plan: yours });

          expect(sideboardNotice(page)).toBeUndefined();
        });

        it('doesn’t warn on an MTGO draft', async () => {
          const { sideboardPicks, yours } = sideboardOf(16);
          const { page } = await openDeck(sideboardPicks, { platform: 'MTGO' }, { plan: yours });

          expect(sideboardNotice(page)).toBeUndefined();
        });
      });
    });

    it('reports a failed copy for Moxfield when the clipboard refuses', async () => {
      writeText.mockRejectedValue(new Error('denied'));
      const opened = await openDeck(picks);

      await copyFor(opened, 'Moxfield');

      expect(alertIn(deckPanel(opened.page))?.textContent).toContain("Couldn't copy");
      expect(announced(opened.page)).toBe('');
      expect(shownLabel(copyButton(opened.page, 'Moxfield')!)).toBe('Copy for Moxfield');
    });

    it('reports a failed copy for Arena when the clipboard refuses', async () => {
      writeText.mockRejectedValue(new Error('denied'));
      const opened = await openDeck(picks);

      await copyFor(opened);

      expect(alertIn(deckPanel(opened.page))?.textContent).toContain("Couldn't copy");
      expect(announced(opened.page)).toBe('');
      expect(shownLabel(copyButton(opened.page)!)).toBe('Copy for Arena');
    });

    it('confirms a copy on the clicked button, with a checkmark', async () => {
      const opened = await openDeck(picks);
      const { page } = opened;

      await copyFor(opened);

      expect(shownLabel(copyButton(page)!)).toBe('Copied');
      expect(copyButton(page)!.querySelector('svg')).not.toBeNull();
      expect(shownLabel(copyButton(page, 'Moxfield')!)).toBe('Copy for Moxfield');
      expect(copyButton(page, 'Moxfield')!.querySelector('svg')).toBeNull();
    });

    describe('over time', () => {
      afterEach(() => vi.useRealTimers());

      /** Opens the Deck tab, then takes over the clock. */
      async function openDeckWithClock() {
        const opened = await openDeck(picks);
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        return opened;
      }

      /** Lets `ms` pass, then shows what changed. */
      async function pass(fixture: { whenStable(): Promise<unknown> }, ms: number) {
        vi.advanceTimersByTime(ms);
        await fixture.whenStable();
      }

      it('returns the button to its label after 2 seconds', async () => {
        const { fixture, page } = await openDeckWithClock();
        copyButton(page)!.click();
        await fixture.whenStable();

        await pass(fixture, 1999);
        expect(shownLabel(copyButton(page)!)).toBe('Copied');

        await pass(fixture, 1);
        expect(shownLabel(copyButton(page)!)).toBe('Copy for Arena');
        expect(announced(page)).toBe('');
      });

      it('copies again and restarts the 2 seconds when clicked while confirmed', async () => {
        const { fixture, page } = await openDeckWithClock();
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
        const { fixture, page } = await openDeckWithClock();
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
        const { fixture, page } = await openDeckWithClock();
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
          const { fixture, page } = await openDeckWithClock();
          copyButton(page)!.click();
          await fixture.whenStable();

          tabButton(page, tab).click();
          await fixture.whenStable();

          expect(shownLabel(copyButton(page)!)).toBe('Copy for Arena');
          expect(announced(page)).toBe('');
        },
      );

      it('does not confirm a copy that finishes after the panel has closed', async () => {
        let finishCopy = () => {};
        writeText.mockReturnValue(new Promise((resolve) => (finishCopy = resolve)));
        const { fixture, page } = await openDeckWithClock();
        copyButton(page)!.click();
        await fixture.whenStable();

        tabButton(page, 'Pool').click();
        await fixture.whenStable();
        finishCopy();
        await writeText.mock.results[0]?.value;
        await fixture.whenStable();

        expect(shownLabel(copyButton(page)!)).toBe('Copy for Arena');
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
      expect(alertIn(deckPanel(page))).toBeNull();
    });

    it('keeps the button confirmed, without a flicker, while it copies again', async () => {
      const opened = await openDeck(picks);
      await copyFor(opened);
      expect(shownLabel(copyButton(opened.page)!)).toBe('Copied');

      holdCopies();
      await copyFor(opened);

      expect(shownLabel(copyButton(opened.page)!)).toBe('Copied');
    });

    it('takes the confirmation off a confirmed button whose next copy fails', async () => {
      const opened = await openDeck(picks);
      await copyFor(opened);
      expect(shownLabel(copyButton(opened.page)!)).toBe('Copied');

      writeText.mockRejectedValue(new Error('denied'));
      await copyFor(opened);

      expect(alertIn(deckPanel(opened.page))).not.toBeNull();
      expect(shownLabel(copyButton(opened.page)!)).toBe('Copy for Arena');
    });

    it('ignores an earlier copy failing once a later one has started', async () => {
      const opened = await openDeck(picks);
      const held = holdCopies();
      await copyFor(opened);
      await copyFor(opened, 'Moxfield');
      held[1].resolve();
      await settled(opened, 1);

      held[0].reject(new Error('denied'));
      await settled(opened, 0);

      expect(alertIn(deckPanel(opened.page))).toBeNull();
      expect(shownLabel(copyButton(opened.page, 'Moxfield')!)).toBe('Copied');
    });

    it('ignores a copy failing after the panel has closed', async () => {
      const opened = await openDeck(picks);
      const held = holdCopies();
      await copyFor(opened);

      tabButton(opened.page, 'Pool').click();
      await opened.fixture.whenStable();
      held[0].reject(new Error('denied'));
      await settled(opened, 0);

      expect(alertIn(deckPanel(opened.page))).toBeNull();
    });

    it('confirms none of the copies started before the panel closed and opened again', async () => {
      const opened = await openDeck(picks);
      const held = holdCopies();
      await copyFor(opened);
      await copyFor(opened);
      tabButton(opened.page, 'Pool').click();
      await opened.fixture.whenStable();
      tabButton(opened.page, 'Deck').click();
      await opened.fixture.whenStable();
      await copyFor(opened);

      held[0].resolve();
      await settled(opened, 0);

      expect(shownLabel(copyButton(opened.page)!)).toBe('Copy for Arena');
    });

    it('clears the failure alert on the next copy attempt', async () => {
      writeText.mockRejectedValueOnce(new Error('denied'));
      const opened = await openDeck(picks);
      await copyFor(opened);

      await copyFor(opened);

      expect(alertIn(deckPanel(opened.page))).toBeNull();
      expect(shownLabel(copyButton(opened.page)!)).toBe('Copied');
    });

    it('clears the failure alert when a tab closes the panel', async () => {
      writeText.mockRejectedValue(new Error('denied'));
      const opened = await openDeck(picks);
      await copyFor(opened);

      tabButton(opened.page, 'Pool').click();
      await opened.fixture.whenStable();

      expect(alertIn(deckPanel(opened.page))).toBeNull();
    });
  });
});
