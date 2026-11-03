import type { DraftView, PlanView, QueueRefusal, QueueView } from 'contract';
import {
  useDraftsApp,
  alice,
  alicePlayer,
  bob,
  http,
  tabButton,
  panel,
  openDraft,
  completeSnapshot,
  button,
  type AppFixture,
} from './harness';
import { card, shivan } from './pool-tab-harness';
import { EMPTY_QUEUE } from '../drafts';

useDraftsApp();

/** Plans are only open to app admins for now, and this Alice is one. */
describe('queueing the unpicked cards on the plan tab', () => {
  const admin = { ...alice, isAppAdmin: true };
  /** Started, with Alice then Bob; Bob is up. */
  const drafting = (fields: Partial<DraftView> = {}): Partial<DraftView> => ({
    state: 'Drafting',
    players: [alicePlayer, bob],
    turn: { pick: 2, round: 1, playerId: bob.id },
    ...fields,
  });
  const bolt = card({ id: 'bolt-card', name: 'Lightning Bolt', manaValue: 1 });
  const boltAgain = card({ id: 'bolt-again', name: 'Lightning Bolt', manaValue: 1 });
  const shock = card({ id: 'shock-card', name: 'Shock', manaValue: 1 });
  const cards = [shivan, bolt, boltAgain, shock];
  /** Shivan Dragon picked and two unpicked Lightning Bolts on the mainboard, and an unpicked Shock on the sideboard. */
  const plan: PlanView = {
    mainboard: [
      { poolCardId: bolt.id, name: bolt.name, picked: false },
      { poolCardId: boltAgain.id, name: boltAgain.name, picked: false },
      { poolCardId: shivan.id, name: shivan.name, picked: true },
    ],
    sideboard: [{ poolCardId: shock.id, name: shock.name, picked: false }],
    basics: [],
    lost: [],
  };
  const queueOf = (...queued: { id: string; name: string }[]): QueueView => ({
    ...EMPTY_QUEUE,
    cards: queued.map(({ id, name }) => ({ poolCardId: id, name })),
  });

  async function openPlan(fixture: AppFixture, page: HTMLElement) {
    tabButton(page, 'Plan').click();
    await fixture.whenStable();
    return panel(page);
  }

  const dialog = (root: HTMLElement) => root.querySelector<HTMLElement>('[role="dialog"]');
  const sideboardBox = (root: HTMLElement) =>
    [...dialog(root)!.querySelectorAll('label')]
      .find((label) => label.textContent?.trim() === 'Include sideboard')!
      .querySelector('input')!;
  const text = (element: HTMLElement | null) => element?.textContent?.replace(/\s+/g, ' ').trim();

  /** Opens the Queue unpicked modal on the Plan tab. */
  async function openModal(fixture: AppFixture, page: HTMLElement) {
    const tab = await openPlan(fixture, page);
    button(tab, 'Queue unpicked')!.click();
    await fixture.whenStable();
    return tab;
  }

  it('counts the mainboard’s unpicked copies not yet queued, and the sideboard’s too when included', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards,
      user: admin,
      plan,
      queue: queueOf(boltAgain),
    });
    const tab = await openModal(fixture, page);

    expect(dialog(tab)!.getAttribute('aria-modal')).toBe('true');
    expect(sideboardBox(tab).checked).toBe(false);
    expect(text(dialog(tab))).toContain('Adds 1 card to the end of your queue.');

    sideboardBox(tab).click();
    await fixture.whenStable();
    expect(text(dialog(tab))).toContain('Adds 2 cards to the end of your queue.');
  });

  it('appends the mainboard’s unpicked cards, and shows the queue the API answers with', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards,
      user: admin,
      plan,
    });
    const tab = await openModal(fixture, page);

    button(dialog(tab)!, 'Queue 2 cards')!.click();
    const sent = http.expectOne('/api/drafts/draft-1/queue/unpicked');
    expect(sent.request.method).toBe('POST');
    expect(sent.request.body).toEqual({ includeSideboard: false });
    sent.flush(queueOf(bolt, boltAgain));

    await vi.waitFor(() => expect(dialog(tab)).toBeNull());
    // Every mainboard copy is queued now, though the sideboard's Shock isn't.
    button(tab, 'Queue unpicked')!.click();
    await fixture.whenStable();
    expect(text(dialog(tab))).toContain('Nothing on your mainboard to queue.');
    expect(button(dialog(tab)!, 'Queue 0 cards')!.disabled).toBe(true);
    tabButton(page, 'Queue').click();
    await fixture.whenStable();
    expect(panel(page).textContent).toContain('Lightning Bolt');
  });

  it('includes the sideboard when checked, and opens unchecked each time', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards,
      user: admin,
      plan,
    });
    const tab = await openModal(fixture, page);
    sideboardBox(tab).click();
    await fixture.whenStable();
    button(dialog(tab)!, 'Cancel')!.click();
    await fixture.whenStable();
    expect(dialog(tab)).toBeNull();

    button(tab, 'Queue unpicked')!.click();
    await fixture.whenStable();
    expect(sideboardBox(tab).checked).toBe(false);
    sideboardBox(tab).click();
    await fixture.whenStable();
    button(dialog(tab)!, 'Queue 3 cards')!.click();

    const sent = http.expectOne('/api/drafts/draft-1/queue/unpicked');
    expect(sent.request.body).toEqual({ includeSideboard: true });
    sent.flush(queueOf(bolt, boltAgain, shock));
    await vi.waitFor(() => expect(dialog(tab)).toBeNull());
  });

  it('is disabled when every unpicked copy is queued already', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards,
      user: admin,
      plan,
      queue: queueOf(bolt, boltAgain, shock),
    });
    const tab = await openPlan(fixture, page);

    expect(button(tab, 'Queue unpicked')!.disabled).toBe(true);
  });

  it('says why it was refused, and re-reads the queue', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards,
      user: admin,
      plan,
    });
    const tab = await openModal(fixture, page);

    button(dialog(tab)!, 'Queue 2 cards')!.click();
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
    expect(dialog(tab)).toBeNull();
    await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/queue'));
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
      user: admin,
      plan,
    });
    const tab = await openPlan(fixture, page);

    expect(button(tab, 'Queue unpicked')).toBeUndefined();
  });
});
