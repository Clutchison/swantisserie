import type { DraftChangeRefusal } from 'contract';
import { MAX_PLAYERS } from 'engine';
import {
  useDraftsApp,
  draft,
  http,
  section,
  bob,
  alicePlayer,
  openDraft,
  flushQueueAndPlan,
  flushPicks,
  completeSnapshot,
  button,
  playerAvatar,
} from './harness';

useDraftsApp();

describe('lobby', () => {
  it('lists the players with their avatars', async () => {
    const { page } = await openDraft(completeSnapshot, { players: [bob, alicePlayer] });

    const players = section(page, 'Players');
    const items = [...players.querySelectorAll('li')];
    expect(items.map((li) => li.querySelector('.name')?.textContent)).toEqual(['Bob', 'Alice']);
    expect(playerAvatar(page, 'Bob')?.getAttribute('src')).toBe(bob.avatarUrl);
  });

  it('leaves out an avatar that fails to load, keeping the other players’', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, { players: [bob, alicePlayer] });

    playerAvatar(page, 'Bob')!.dispatchEvent(new Event('error'));
    await fixture.whenStable();

    expect(playerAvatar(page, 'Bob')).toBeFalsy();
    expect(playerAvatar(page, 'Alice')?.getAttribute('src')).toBe(alicePlayer.avatarUrl);
    expect(section(page, 'Players').textContent).toContain('Bob');
  });

  it('says when nobody has joined yet', async () => {
    const { page } = await openDraft(completeSnapshot, { players: [] });

    expect(section(page, 'Players').textContent).toContain('Nobody has joined yet');
  });

  it('joins the draft, then offers to leave it', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, { players: [bob] });
    expect(button(page, 'Leave')).toBeUndefined();

    button(page, 'Join')!.click();
    const req = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/players'));
    expect(req.request.method).toBe('POST');
    req.flush(draft({ players: [bob, alicePlayer] }), { status: 201, statusText: 'Created' });
    await flushQueueAndPlan();
    await fixture.whenStable();

    expect(section(page, 'Players').textContent).toContain('Alice');
    expect(button(page, 'Join')).toBeUndefined();
    button(page, 'Leave')!.click();
    const left = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/players/me'));
    expect(left.request.method).toBe('DELETE');
    left.flush(draft({ players: [bob] }));
    await fixture.whenStable();

    expect(section(page, 'Players').textContent).not.toContain('Alice');
    expect(button(page, 'Join')).toBeDefined();
  });

  it('shows the draft as full at the most players a draft can have, offering no Join', async () => {
    const players = Array.from({ length: MAX_PLAYERS }, (_, i) => ({
      ...bob,
      id: `player-${i}`,
      name: `Player ${i + 1}`,
    }));
    const { page } = await openDraft(completeSnapshot, { players });

    expect(page.textContent).toContain('This draft is full.');
    expect(button(page, 'Join')).toBeUndefined();
  });

  it('offers Join with room for one more player', async () => {
    const players = Array.from({ length: MAX_PLAYERS - 1 }, (_, i) => ({
      ...bob,
      id: `player-${i}`,
      name: `Player ${i + 1}`,
    }));
    const { page } = await openDraft(completeSnapshot, { players });

    expect(page.textContent).not.toContain('This draft is full.');
    expect(button(page, 'Join')).toBeDefined();
  });

  it('offers neither once the draft has started', async () => {
    const { page } = await openDraft(completeSnapshot, {
      state: 'Drafting',
      players: [alicePlayer],
    });

    expect(button(page, 'Join')).toBeUndefined();
    expect(button(page, 'Leave')).toBeUndefined();
  });

  it('shows the draft as started when a join is refused for it', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, { players: [bob] });

    button(page, 'Join')!.click();
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/players'))).flush(
      { error: 'draft-started', message: 'This draft has started.' } satisfies DraftChangeRefusal,
      { status: 409, statusText: 'Conflict' },
    );
    // The page re-reads the draft to catch up with its new state.
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(
      draft({ state: 'Drafting', players: [bob] }),
    );
    await flushPicks([]);
    await fixture.whenStable();

    expect(page.querySelector('.error')?.textContent).toContain('This draft has started.');
    expect(page.textContent).toContain('Drafting');
    expect(button(page, 'Join')).toBeUndefined();
  });
});
