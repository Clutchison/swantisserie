import { EMPTY_QUEUE } from '../drafts';
import {
  useDraftsApp,
  draft,
  http,
  section,
  bob,
  alicePlayer,
  openDraft,
  flushQueue,
  flushPicks,
  completeSnapshot,
  button,
} from './harness';

useDraftsApp();

describe('lobby', () => {
  it('lists the players with their avatars', async () => {
    const { page } = await openDraft(completeSnapshot, { players: [bob, alicePlayer] });

    const players = section(page, 'Players');
    const items = [...players.querySelectorAll('li')];
    expect(items.map((li) => li.querySelector('.name')?.textContent)).toEqual(['Bob', 'Alice']);
    expect(items[0].querySelector('img')?.getAttribute('src')).toBe(bob.avatarUrl);
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
    await flushQueue(EMPTY_QUEUE);
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
      { error: 'draft-started', message: 'This draft has started.' },
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
