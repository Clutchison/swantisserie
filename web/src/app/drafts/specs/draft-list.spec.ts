import {
  useDraftsApp,
  draft,
  expectLoadingAnimation,
  http,
  openList,
  openUrl,
  section,
} from './harness';

useDraftsApp();

describe('draft list', () => {
  it('says so while the drafts load', async () => {
    const { fixture, page } = await openUrl('/');
    const req = http.expectOne('/api/drafts');
    await expectLoadingAnimation(() => page, 'Loading…', 288);

    req.flush([]);
    await fixture.whenStable();
    expect(page.textContent).not.toContain('Loading…');
  });

  it('shows active and complete drafts separately', async () => {
    const page = await openList([
      draft({ id: 'a', name: 'Red dragons', state: 'Lobby' }),
      draft({ id: 'b', name: 'Arena cube', state: 'Drafting' }),
      draft({ id: 'c', name: 'Last month', state: 'Complete' }),
    ]);

    const active = section(page, 'Active drafts').textContent;
    expect(active).toContain('Red dragons');
    expect(active).toContain('Lobby');
    expect(active).toContain('Arena cube');
    expect(active).toContain('Drafting');
    expect(active).not.toContain('Last month');
    const complete = section(page, 'Complete drafts').textContent;
    expect(complete).toContain('Last month');
    expect(complete).not.toContain('Red dragons');
  });

  it('lists a closed draft only under Closed drafts, between active and complete', async () => {
    const page = await openList([
      draft({ id: 'a', name: 'Red dragons', state: 'Paused' }),
      draft({ id: 'b', name: 'Shut early', state: 'Closed' }),
      draft({ id: 'c', name: 'Last month', state: 'Complete' }),
    ]);

    expect([...page.querySelectorAll('h2')].map((h2) => h2.textContent)).toEqual([
      'Active drafts',
      'Closed drafts',
      'Complete drafts',
    ]);
    expect(section(page, 'Closed drafts').textContent).toContain('Shut early');
    expect(section(page, 'Closed drafts').textContent).not.toContain('Red dragons');
    expect(section(page, 'Active drafts').textContent).not.toContain('Shut early');
    expect(section(page, 'Complete drafts').textContent).not.toContain('Shut early');
  });

  it('says so when there are no drafts yet', async () => {
    const page = await openList([]);

    expect(section(page, 'Active drafts').textContent).toContain('No active drafts');
    expect(section(page, 'Closed drafts').textContent).toContain('No closed drafts');
    expect(section(page, 'Complete drafts').textContent).toContain('No complete drafts');
  });

  it('links to the create form', async () => {
    const page = await openList([]);

    const link = page.querySelector<HTMLAnchorElement>('a[href="/drafts/new"]');
    expect(link?.textContent).toContain('New draft');
  });

  it('links each draft to its page', async () => {
    const page = await openList([draft({ id: 'a', name: 'Red dragons' })]);

    const link = page.querySelector<HTMLAnchorElement>('a[href="/drafts/a"]');
    expect(link?.textContent).toContain('Red dragons');
  });

  it('makes all of an active draft one link, with its state and organizer inside', async () => {
    const page = await openList([draft({ id: 'a', name: 'Red dragons', state: 'Lobby' })]);

    const links = section(page, 'Active drafts').querySelectorAll('a');
    expect(links.length).toBe(1);
    expect(links[0].getAttribute('href')).toBe('/drafts/a');
    expect(links[0].textContent).toContain('Red dragons');
    expect(links[0].textContent).toContain('Lobby');
    expect(links[0].textContent).toContain('Organized by');
  });

  it.each([
    ['Closed', 'Closed drafts'],
    ['Complete', 'Complete drafts'],
  ] as const)('makes all of a %s draft one link, with its organizer inside', async (state, heading) => {
    const page = await openList([draft({ id: 'a', name: 'Red dragons', state })]);

    const links = section(page, heading).querySelectorAll('a');
    expect(links.length).toBe(1);
    expect(links[0].getAttribute('href')).toBe('/drafts/a');
    expect(links[0].textContent).toContain('Red dragons');
    expect(links[0].textContent).toContain('Organized by');
  });

  it('keeps the empty messages out of any link', async () => {
    const page = await openList([]);

    for (const heading of ['Active drafts', 'Closed drafts', 'Complete drafts']) {
      expect(section(page, heading).querySelector('a')).toBeNull();
    }
  });
});
