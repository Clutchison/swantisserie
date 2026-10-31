import { type DraftView, type PickView, type PoolCardView } from '../drafts';
import {
  useDraftsApp,
  alice,
  draft,
  http,
  router,
  updates,
  bob,
  alicePlayer,
  tabButton,
  panel,
  openDraft,
  flushPicks,
  completeSnapshot,
} from './harness';

useDraftsApp();

describe('live updates', () => {
  const drafting = (fields: Partial<DraftView> = {}) =>
    draft({
      state: 'Drafting',
      players: [alicePlayer, bob],
      turn: { pick: 1, round: 1, playerId: alice.id },
      ...fields,
    });
  const shivan: PoolCardView = {
    scryfallId: 'shivan-id',
    oracleId: 'shivan-oracle',
    name: 'Shivan Dragon',
    set: 'm10',
    collectorNumber: '155',
    typeLine: 'Creature — Dragon',
    colors: ['R'],
    manaValue: 6,
    manaCost: '{4}{R}{R}',
    oracleText: 'Flying\n{R}: Shivan Dragon gets +1/+0 until end of turn.',
    colorIdentity: ['R'],
    keywords: ['Flying'],
    rarity: 'rare',
    layout: 'normal',
    power: '5',
    toughness: '5',
    loyalty: null,
    defense: null,
    faces: [],
    images: [{ small: 's.jpg', normal: 'n.jpg', large: 'l.jpg' }],
  };
  const shivanPick: PickView = {
    pick: 1,
    playerId: alice.id,
    oracleId: 'shivan-oracle',
    name: 'Shivan Dragon',
    layout: 'normal',
    set: 'ima',
    collectorNumber: '1',
  };

  it('watches the draft it shows', async () => {
    await openDraft(completeSnapshot, drafting());

    expect(updates.watch).toHaveBeenCalledWith('draft-1');
  });

  it('shows another player’s pick on the Pool, Board and Me tabs, and the turn passing', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), { cards: [shivan] });
    expect(page.textContent).toContain('Your turn: pick 1, round 1');

    updates.events.next({
      type: 'changed',
      draft: drafting({ turn: { pick: 2, round: 1, playerId: bob.id } }),
    });
    await flushPicks([shivanPick]);
    await fixture.whenStable();

    expect(page.textContent).toContain('Bob’s turn: pick 2, round 1');
    expect(page.querySelector('.tile')?.classList).toContain('picked');
    tabButton(page, 'Board').click();
    await fixture.whenStable();
    expect(panel(page).querySelector('.log')?.textContent).toContain('Shivan Dragon');
    tabButton(page, 'Me').click();
    await fixture.whenStable();
    expect(panel(page).textContent).toContain('Shivan Dragon');
  });

  it('follows the draft out of the lobby when the organizer starts it', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, {
      players: [alicePlayer, bob],
    });

    updates.events.next({ type: 'changed', draft: drafting() });
    await flushPicks([]);
    await fixture.whenStable();

    expect(page.textContent).toContain('Drafting');
    expect(page.textContent).toContain('Your turn: pick 1, round 1');
  });

  it('ignores a pushed draft older than the one it shows', async () => {
    const { fixture, page } = await openDraft(
      completeSnapshot,
      drafting({ turn: { pick: 2, round: 1, playerId: bob.id }, version: 5 }),
      { cards: [shivan], picks: [shivanPick] },
    );

    updates.events.next({ type: 'changed', draft: drafting({ version: 4 }) });
    await fixture.whenStable();

    expect(page.textContent).toContain('Bob’s turn: pick 2, round 1');
    http.expectNone('/api/drafts/draft-1/picks');
  });

  it('stops watching when the page closes', async () => {
    await openDraft(completeSnapshot, drafting());
    expect(updates.events.observed).toBe(true);

    await router.navigateByUrl('/');
    (await vi.waitFor(() => http.expectOne('/api/drafts'))).flush([]);

    expect(updates.events.observed).toBe(false);
  });

  it('catches up with the draft and its picks when it reconnects', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), { cards: [shivan] });

    updates.events.next({ type: 'connected' });
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(
      drafting({ turn: { pick: 2, round: 1, playerId: bob.id } }),
    );
    await flushPicks([shivanPick]);
    await fixture.whenStable();

    expect(page.textContent).toContain('Bob’s turn: pick 2, round 1');
    expect(page.querySelector('.tile')?.classList).toContain('picked');
  });
});
