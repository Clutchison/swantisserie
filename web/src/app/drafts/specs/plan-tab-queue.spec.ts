import type { QueueRefusal } from 'contract';
import {
  useDraftsApp,
  alice,
  bob,
  http,
  tabButton,
  panel,
  openDraft,
  queueOf,
  queued,
  completeSnapshot,
  flushPicks,
  flushQueueAndPlan,
  updates,
  draft,
  button,
  type AppFixture,
  drafting,
  text,
} from './harness';
import {
  clickBackdrop,
  dialogBackdrop,
  hiddenFromAssistiveTech,
  openDialog,
  pressEscape,
  pressTab,
} from '../../specs-harness';
import { card, shivan } from './pool-tab-harness';
import { bolt, boltAgain, openPlan, planOf, planned, unpicked } from './plan-tab-harness';
import { EMPTY_QUEUE } from '../drafts';

useDraftsApp();

describe('queueing the unpicked cards on the plan tab', () => {
  /** Bob's turn, on the draft's second pick. */
  const bobsSecondPick = { pick: 2, round: 1, playerId: bob.id };
  const shock = card({ id: 'shock-card', name: 'Shock', manaValue: 1 });
  const cards = [shivan, bolt, boltAgain, shock];
  /** Shivan Dragon picked and two unpicked Lightning Bolts on the mainboard, and an unpicked Shock on the sideboard. */
  const plan = planOf({
    mainboard: [unpicked(bolt), unpicked(boltAgain), planned(shivan)],
    sideboard: [unpicked(shock)],
  });

  /** The open dialog, if any: it opens over the page, outside the tab. */
  const dialog = openDialog;
  const sideboardBox = () =>
    [...openDialog()!.querySelectorAll('label')]
      .find((label) => label.textContent?.trim() === 'Include sideboard')!
      .querySelector('input')!;

  /** Opens the Queue unpicked dialog on the Plan tab. */
  async function openQueueUnpicked(fixture: AppFixture, page: HTMLElement) {
    const tab = await openPlan(fixture, page);
    button(tab, 'Queue unpicked')!.click();
    await fixture.whenStable();
    return tab;
  }

  it('counts the mainboard’s unpicked copies not yet queued, and the sideboard’s too when included', async () => {
    const { fixture, page } = await openDraft(
      completeSnapshot,
      drafting({ turn: bobsSecondPick }),
      {
        cards,
        plan,
        queue: queueOf({ cards: [queued(boltAgain)] }),
      },
    );
    await openQueueUnpicked(fixture, page);

    expect(dialog()!.getAttribute('aria-modal')).toBe('true');
    expect(sideboardBox().checked).toBe(false);
    expect(text(dialog())).toContain('Adds 1 card to the end of your queue.');

    sideboardBox().click();
    await fixture.whenStable();
    expect(text(dialog())).toContain('Adds 2 cards to the end of your queue.');
  });

  it('appends the mainboard’s unpicked cards, and shows the queue the API answers with', async () => {
    const { fixture, page } = await openDraft(
      completeSnapshot,
      drafting({ turn: bobsSecondPick }),
      {
        cards,
        plan,
      },
    );
    const tab = await openQueueUnpicked(fixture, page);

    button(dialog()!, 'Queue 2 cards')!.click();
    const sent = http.expectOne('/api/drafts/draft-1/queue/unpicked');
    await fixture.whenStable();
    expect(button(dialog()!, 'Queue 2 cards')!.disabled).toBe(true);
    expect(sent.request.method).toBe('POST');
    expect(sent.request.body).toEqual({ includeSideboard: false });
    sent.flush(queueOf({ cards: [queued(bolt), queued(boltAgain)] }));

    await vi.waitFor(() => expect(dialog()).toBeNull());
    // Every mainboard copy is queued now, though the sideboard's Shock isn't.
    button(tab, 'Queue unpicked')!.click();
    await fixture.whenStable();
    expect(text(dialog())).toContain('Nothing on your mainboard to queue.');
    expect(button(dialog()!, 'Queue 0 cards')!.disabled).toBe(true);
    tabButton(page, 'Queue').click();
    await fixture.whenStable();
    expect(panel(page).textContent).toContain('Lightning Bolt');
  });

  it('closes on a click on the backdrop, but not on a drag out of the dialog', async () => {
    const { fixture, page } = await openDraft(
      completeSnapshot,
      drafting({ turn: bobsSecondPick }),
      {
        cards,
        plan,
      },
    );
    await openQueueUnpicked(fixture, page);
    const queueUnpicked = dialog()!;
    const backdrop = dialogBackdrop();

    // A press inside the dialog, let go on the backdrop, as a text selection dragged out.
    queueUnpicked.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    backdrop.click();
    await fixture.whenStable();
    expect(dialog()).not.toBeNull();

    backdrop.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    backdrop.click();
    await fixture.whenStable();
    expect(dialog()).toBeNull();
  });

  it('includes the sideboard when checked, and opens unchecked each time', async () => {
    const { fixture, page } = await openDraft(
      completeSnapshot,
      drafting({ turn: bobsSecondPick }),
      {
        cards,
        plan,
      },
    );
    const tab = await openQueueUnpicked(fixture, page);
    sideboardBox().click();
    await fixture.whenStable();
    button(dialog()!, 'Cancel')!.click();
    await fixture.whenStable();
    expect(dialog()).toBeNull();

    button(tab, 'Queue unpicked')!.click();
    await fixture.whenStable();
    expect(sideboardBox().checked).toBe(false);
    sideboardBox().click();
    await fixture.whenStable();
    button(dialog()!, 'Queue 3 cards')!.click();

    const sent = http.expectOne('/api/drafts/draft-1/queue/unpicked');
    expect(sent.request.body).toEqual({ includeSideboard: true });
    sent.flush(queueOf({ cards: [queued(bolt), queued(boltAgain), queued(shock)] }));
    await vi.waitFor(() => expect(dialog()).toBeNull());
  });

  it('is disabled when every unpicked copy is queued already', async () => {
    const { fixture, page } = await openDraft(
      completeSnapshot,
      drafting({ turn: bobsSecondPick }),
      {
        cards,
        plan,
        queue: queueOf({ cards: [queued(bolt), queued(boltAgain), queued(shock)] }),
      },
    );
    const tab = await openPlan(fixture, page);

    expect(button(tab, 'Queue unpicked')!.disabled).toBe(true);
  });

  it('says when the mainboard has nothing to queue, until the sideboard is included', async () => {
    const { fixture, page } = await openDraft(
      completeSnapshot,
      drafting({ turn: bobsSecondPick }),
      {
        cards,
        plan,
        queue: queueOf({ cards: [queued(bolt), queued(boltAgain)] }),
      },
    );
    await openQueueUnpicked(fixture, page);
    expect(text(dialog())).toContain('Nothing on your mainboard to queue.');

    sideboardBox().click();
    await fixture.whenStable();
    expect(text(dialog())).toContain('Adds 1 card to the end of your queue.');
    expect(button(dialog()!, 'Queue 1 card')!.disabled).toBe(false);
  });

  it('says why it was refused, and re-reads the queue', async () => {
    const { fixture, page } = await openDraft(
      completeSnapshot,
      drafting({ turn: bobsSecondPick }),
      {
        cards,
        plan,
      },
    );
    const tab = await openQueueUnpicked(fixture, page);

    button(dialog()!, 'Queue 2 cards')!.click();
    http.expectOne('/api/drafts/draft-1/queue/unpicked').flush(
      {
        error: 'your-turn',
        message: 'You can’t add to your queue on your turn.',
      } satisfies QueueRefusal,
      { status: 409, statusText: 'Conflict' },
    );

    await vi.waitFor(() =>
      expect(tab.querySelector('[role="alert"]')?.textContent).toContain(
        'You can’t add to your queue on your turn.',
      ),
    );
    expect(dialog()).toBeNull();
    await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/queue'));
  });

  it('closes when the player’s turn comes, and stays closed once it passes', async () => {
    const { fixture, page } = await openDraft(
      completeSnapshot,
      drafting({ turn: bobsSecondPick }),
      {
        cards,
        plan,
      },
    );
    const tab = await openQueueUnpicked(fixture, page);
    sideboardBox().click();
    await fixture.whenStable();

    updates.events.next({
      type: 'changed',
      draft: draft(drafting({ turn: { pick: 1, round: 1, playerId: alice.id }, version: 1 })),
    });
    await flushPicks([]);
    await flushQueueAndPlan(EMPTY_QUEUE, plan);
    await fixture.whenStable();
    expect(dialog()).toBeNull();
    // The player moves on, and the turn passes to Bob.
    tabButton(page, 'Plan').focus();
    updates.events.next({
      type: 'changed',
      draft: draft(drafting({ turn: { pick: 2, round: 1, playerId: bob.id }, version: 2 })),
    });
    await flushPicks([]);
    await flushQueueAndPlan(EMPTY_QUEUE, plan);
    await fixture.whenStable();

    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(tabButton(page, 'Plan'));
    button(tab, 'Queue unpicked')!.click();
    await fixture.whenStable();
    expect(sideboardBox().checked).toBe(false);
  });

  it('opens on Cancel, and keeps Tab and Shift+Tab inside the dialog, wrapping at either end', async () => {
    const { fixture, page } = await openDraft(
      completeSnapshot,
      drafting({ turn: bobsSecondPick }),
      { cards, plan },
    );
    await openQueueUnpicked(fixture, page);
    await vi.waitFor(() => expect(document.activeElement).toBe(button(dialog()!, 'Cancel')));

    pressTab();
    expect(document.activeElement).toBe(button(dialog()!, 'Queue 2 cards'));
    pressTab();
    expect(document.activeElement).toBe(sideboardBox());
    pressTab({ shift: true });
    expect(document.activeElement).toBe(button(dialog()!, 'Queue 2 cards'));
  });

  it('hides the page behind the dialog from assistive technology while it is open', async () => {
    const { fixture, page } = await openDraft(
      completeSnapshot,
      drafting({ turn: bobsSecondPick }),
      { cards, plan },
    );
    const tab = await openQueueUnpicked(fixture, page);

    await vi.waitFor(() => expect(hiddenFromAssistiveTech(tab)).toBe(true));
    expect(hiddenFromAssistiveTech(dialog()!)).toBe(false);
  });

  it.each<[string, () => void]>([
    ['Cancel', () => button(dialog()!, 'Cancel')!.click()],
    ['Escape', pressEscape],
    ['a backdrop click', clickBackdrop],
  ])('returns focus to the Queue unpicked button on %s', async (_, close) => {
    const { fixture, page } = await openDraft(
      completeSnapshot,
      drafting({ turn: bobsSecondPick }),
      { cards, plan },
    );
    const tab = await openPlan(fixture, page);
    button(tab, 'Queue unpicked')!.focus();
    button(tab, 'Queue unpicked')!.click();
    await fixture.whenStable();
    await vi.waitFor(() => expect(document.activeElement).toBe(button(dialog()!, 'Cancel')));

    close();
    await fixture.whenStable();

    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(button(tab, 'Queue unpicked'));
  });

  it('returns focus to the Queue unpicked button once its cards are queued', async () => {
    const { fixture, page } = await openDraft(
      completeSnapshot,
      drafting({ turn: bobsSecondPick }),
      { cards, plan },
    );
    const tab = await openPlan(fixture, page);
    button(tab, 'Queue unpicked')!.focus();
    button(tab, 'Queue unpicked')!.click();
    await fixture.whenStable();

    button(dialog()!, 'Queue 2 cards')!.click();
    http
      .expectOne('/api/drafts/draft-1/queue/unpicked')
      .flush(queueOf({ cards: [queued(bolt), queued(boltAgain)] }));

    await vi.waitFor(() => expect(dialog()).toBeNull());
    expect(document.activeElement).toBe(button(tab, 'Queue unpicked'));
  });

  it.each([
    ['on the player’s own turn', drafting({ turn: { pick: 1, round: 1, playerId: alice.id } })],
    [
      'on the player’s own turn while paused',
      drafting({ state: 'Paused', turn: { pick: 1, round: 1, playerId: alice.id } }),
    ],
    ['once the draft is closed', drafting({ state: 'Closed', turn: null })],
    ['once the draft is complete', drafting({ state: 'Complete', turn: null })],
  ])('isn’t offered %s', async (_, fields) => {
    const { fixture, page } = await openDraft(completeSnapshot, fields, {
      cards,
      plan,
    });
    const tab = await openPlan(fixture, page);

    expect(button(tab, 'Queue unpicked')).toBeUndefined();
  });
});
