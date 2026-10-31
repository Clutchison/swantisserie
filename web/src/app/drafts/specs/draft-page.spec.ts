import { TestBed } from '@angular/core/testing';
import {
  useDraftsApp,
  draft,
  expectLoadingAnimation,
  http,
  openUrl,
  openDraft,
  poll,
} from './harness';

useDraftsApp();

describe('draft page', () => {
  it('links back to the draft list, named "Drafts" with its chevron hidden from screen readers', async () => {
    const { page } = await openDraft({ state: 'Complete', cards: 540, total: 540 });

    const backLink = page.querySelector<HTMLAnchorElement>('a.back-link')!;
    expect(backLink.textContent?.trim()).toBe('Drafts');
    expect(backLink.getAttribute('href')).toBe('/');
    expect(backLink.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('says so while the draft loads', async () => {
    const { page } = await openUrl('/drafts/draft-1');
    const req = http.expectOne('/api/drafts/draft-1');
    await expectLoadingAnimation(() => page, 'Loading…', 288);

    req.flush(draft({ state: 'Lobby' }));
    await vi.waitFor(() => {
      TestBed.tick();
      expect(page.textContent).not.toContain('Loading…');
    });
    http.match(() => true).forEach((pending) => pending.flush([]));
  });

  it('shows the draft and its pool size once the snapshot is complete', async () => {
    const { page } = await openDraft({ state: 'Complete', cards: 540, total: 540 });

    expect(page.querySelector('h1')?.textContent).toContain('Red dragons');
    expect(page.textContent).toContain('Lobby');
    expect(page.textContent).toContain('Organized by Alice');
    expect(page.textContent).toContain('540 cards in the pool');
    expect(page.querySelector('progress')).toBeNull();
  });

  it('shows snapshot progress and keeps polling until it is complete', async () => {
    const { fixture, page } = await openDraft({ state: 'Running', cards: 0, total: null });
    expect(page.textContent).toContain('Snapshotting the pool');
    expect(page.querySelector('progress')?.hasAttribute('value')).toBe(false);

    await poll(fixture, { state: 'Running', cards: 175, total: 540 });
    expect(page.textContent).toContain('175 of 540 cards');
    const bar = page.querySelector<HTMLProgressElement>('progress')!;
    expect(bar.value).toBe(175);
    expect(bar.max).toBe(540);

    await poll(fixture, { state: 'Complete', cards: 540, total: 540 });
    expect(page.textContent).toContain('540 cards in the pool');
    await new Promise((resolve) => setTimeout(resolve, 20));
    http.expectNone('/api/drafts/draft-1');
  });

  it('shows why the snapshot failed and lets the organizer retry', async () => {
    const { fixture, page } = await openDraft({
      state: 'Failed',
      cards: 0,
      total: null,
      error: 'Scryfall could not be reached.',
    });
    expect(page.querySelector('.error')?.textContent).toContain('Scryfall could not be reached.');

    const retry = [...page.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Retry'),
    )!;
    retry.click();
    const req = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/snapshot'));
    expect(req.request.method).toBe('POST');
    req.flush(draft({ snapshot: { state: 'Running', cards: 0, total: null } }), {
      status: 202,
      statusText: 'Accepted',
    });
    await fixture.whenStable();
    expect(page.textContent).toContain('Snapshotting the pool');

    await poll(fixture, { state: 'Complete', cards: 540, total: 540 });
    expect(page.textContent).toContain('540 cards in the pool');
  });

  it('offers retry only to the organizer or an app admin', async () => {
    const { page } = await openDraft(
      { state: 'Failed', cards: 0, total: null, error: 'Scryfall could not be reached.' },
      { organizer: { id: 'someone-else', name: 'Bob' } },
    );

    expect(page.querySelector('.error')?.textContent).toContain('Scryfall could not be reached.');
    expect([...page.querySelectorAll('button')].some((b) => b.textContent?.includes('Retry'))).toBe(
      false,
    );
  });

  it('says when the draft cannot be loaded', async () => {
    const { fixture, page } = await openUrl('/drafts/draft-1');
    http.expectOne('/api/drafts/draft-1').flush({}, { status: 404, statusText: 'Not Found' });
    await fixture.whenStable();

    expect(page.querySelector('.error')?.textContent).toContain("Couldn't load this draft");
  });
});
