import { useDraftsApp, bob, openDraft } from './harness';

useDraftsApp();

describe('seat order', () => {
  const seats = (page: HTMLElement) => page.querySelector<HTMLDetailsElement>('.players details')!;

  it('is open in the lobby, where seats are arranged', async () => {
    const { page } = await openDraft(
      { state: 'Complete', cards: 540, total: 540 },
      { players: [bob] },
    );

    expect(seats(page).open).toBe(true);
  });

  it('collapses once the draft has started, out of the way of the panels', async () => {
    const { page } = await openDraft(
      { state: 'Complete', cards: 540, total: 540 },
      { state: 'Drafting', players: [bob], turn: { pick: 1, round: 1, playerId: bob.id } },
    );

    expect(seats(page).open).toBe(false);
    expect(page.querySelector('.turn')?.textContent).toContain('Bob’s turn');
  });
});
