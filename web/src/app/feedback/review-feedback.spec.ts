import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { App } from '../app';
import { routes } from '../app.routes';
import type { FeedbackView } from './feedback-page';

const alice = {
  id: '80351110224678912',
  name: 'Alice',
  avatarUrl: 'https://cdn.discordapp.com/embed/avatars/5.png',
  isAdmin: false,
};
const carol = {
  id: '80351110224678914',
  name: 'Carol',
  avatarUrl: 'https://cdn.discordapp.com/embed/avatars/2.png',
  isAdmin: true,
};

const fromAlice: FeedbackView = {
  id: 'feedback-1',
  message: 'Line one\nLine two',
  pageUrl: 'https://swantisserie.example/drafts/42',
  sentAt: '2026-10-31T12:00:00.000Z',
  sender: { name: 'Alice', avatarUrl: alice.avatarUrl },
};
const fromBob: FeedbackView = {
  id: 'feedback-2',
  message: 'The timer is too short',
  pageUrl: 'https://swantisserie.example/',
  sentAt: '2026-10-30T12:00:00.000Z',
  sender: { name: 'Bob', avatarUrl: 'https://cdn.discordapp.com/embed/avatars/1.png' },
};

describe('reviewing feedback', () => {
  let http: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes, withComponentInputBinding()),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  /** Opens `url` as `user`. */
  async function open(url: string, user: typeof alice) {
    const fixture = TestBed.createComponent(App);
    const navigation = router.navigateByUrl(url);
    (await vi.waitFor(() => http.expectOne('/api/auth/me'))).flush(user);
    await navigation;
    TestBed.tick();
    return { fixture, page: fixture.nativeElement as HTMLElement };
  }

  /** Opens the page as Carol, an app admin, with `feedback` waiting. */
  async function openPage(feedback: FeedbackView[]) {
    const opened = await open('/admin/feedback', carol);
    http.expectOne('/api/admin/feedback').flush(feedback);
    await opened.fixture.whenStable();
    return opened;
  }

  const items = (page: HTMLElement) => [...page.querySelectorAll('main li')];
  const markReviewed = (item: Element) =>
    [...item.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Mark reviewed')!;

  it('links app admins to the page from the header', async () => {
    const { fixture, page } = await open('/status', carol);
    http.expectOne('/api/health').flush({});
    await fixture.whenStable();

    page.querySelector<HTMLAnchorElement>('header a[href="/admin/feedback"]')!.click();
    await vi.waitFor(() => http.expectOne('/api/admin/feedback')).then((req) => req.flush([]));
    await fixture.whenStable();

    expect(router.url).toBe('/admin/feedback');
  });

  it('keeps other users off the page', async () => {
    await open('/admin/feedback', alice);

    expect(router.url).toBe('/');
    http.expectNone('/api/admin/feedback');
    http.expectOne('/api/drafts').flush([]);
  });

  it('shows who sent each item, when, its message and its page', async () => {
    const { page } = await openPage([fromAlice]);

    const [item] = items(page);
    expect(item.querySelector('img')?.getAttribute('src')).toBe(alice.avatarUrl);
    expect(item.textContent).toContain('Alice');
    expect(item.querySelector('time')?.textContent).toContain('Oct 31, 2026');
    const link = item.querySelector('a')!;
    expect(link.textContent?.trim()).toBe(fromAlice.pageUrl);
    expect(link.getAttribute('href')).toBe(fromAlice.pageUrl);
  });

  it('shows the items in the order the API sends, newest first', async () => {
    const { page } = await openPage([fromAlice, fromBob]);

    expect(items(page).map((item) => item.querySelector('.message')?.textContent)).toEqual([
      'Line one\nLine two',
      'The timer is too short',
    ]);
  });

  it('shows a message as plain text, never as HTML or Markdown', async () => {
    const message = '<b>bold</b> **stars**\n<img src=x>';
    const { page } = await openPage([{ ...fromAlice, message }]);

    const shown = items(page)[0].querySelector('.message')!;
    expect(shown.textContent).toBe(message);
    expect(shown.children).toHaveLength(0);
  });

  it('marks an item reviewed in one click, with no confirmation, and removes it', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    const { fixture, page } = await openPage([fromAlice, fromBob]);

    markReviewed(items(page)[0]).click();
    const put = http.expectOne('/api/admin/feedback/feedback-1/reviewed');
    expect(put.request.method).toBe('PUT');
    put.flush(null, { status: 204, statusText: 'No Content' });
    (await vi.waitFor(() => http.expectOne('/api/admin/feedback'))).flush([fromBob]);
    await fixture.whenStable();

    expect(confirm).not.toHaveBeenCalled();
    expect(items(page).map((item) => item.textContent)).toEqual([
      expect.stringContaining('Bob'),
    ]);
  });

  it('keeps the item and says so when marking fails', async () => {
    const { fixture, page } = await openPage([fromAlice]);

    markReviewed(items(page)[0]).click();
    http
      .expectOne('/api/admin/feedback/feedback-1/reviewed')
      .flush(null, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();

    expect(page.querySelector('[role="alert"]')?.textContent).toContain('try again');
    expect(items(page)).toHaveLength(1);
  });

  it('says when there is nothing to review', async () => {
    const { page } = await openPage([]);

    expect(page.querySelector('main')?.textContent).toContain('No feedback to review');
  });

  it('says when the feedback cannot be loaded', async () => {
    const { fixture, page } = await open('/admin/feedback', carol);
    http
      .expectOne('/api/admin/feedback')
      .flush(null, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();

    expect(page.querySelector('main')?.textContent).toContain("Couldn't load the feedback");
  });
});
