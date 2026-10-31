import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { App } from '../app';
import { routes } from '../app.routes';
import type { AdminWebhookView } from './webhooks-page';
import { answerUnreviewedCount } from '../feedback/specs-harness';

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

const main: AdminWebhookView = {
  id: 'webhook-main',
  name: '#roto-main',
  url: 'https://discord.com/api/webhooks/1234567890/main-token',
};
const side: AdminWebhookView = {
  id: 'webhook-side',
  name: '#roto-side',
  url: 'https://discord.com/api/webhooks/1234567891/side-token',
};

describe('webhooks page', () => {
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
    answerUnreviewedCount(http);
    return { fixture, page: fixture.nativeElement as HTMLElement };
  }

  /** Opens the page as Carol, an app admin, with `webhooks` registered. */
  async function openPage(webhooks: AdminWebhookView[]) {
    const opened = await open('/admin/webhooks', carol);
    http.expectOne('/api/admin/webhooks').flush(webhooks);
    await opened.fixture.whenStable();
    return opened;
  }

  /** The list's rows, as their name field's value and their URL. */
  const rows = (page: HTMLElement) =>
    [...page.querySelectorAll('li')].map((li) => [
      li.querySelector<HTMLInputElement>('input')?.value,
      li.querySelector('.url')?.textContent?.trim(),
    ]);

  const row = (page: HTMLElement, name: string) =>
    [...page.querySelectorAll('li')].find(
      (li) => li.querySelector<HTMLInputElement>('input')?.value === name,
    )!;

  const button = (root: Element, label: string) =>
    [...root.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent?.trim() === label,
    )!;

  function fill(input: HTMLInputElement, value: string) {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  /** Answers the list's reload after a change with `webhooks`. */
  async function reloaded(
    fixture: Awaited<ReturnType<typeof openPage>>['fixture'],
    webhooks: AdminWebhookView[],
  ) {
    (await vi.waitFor(() => http.expectOne('/api/admin/webhooks'))).flush(webhooks);
    await fixture.whenStable();
  }

  it('lists the webhooks with their URLs', async () => {
    const { page } = await openPage([main, side]);

    expect(rows(page)).toEqual([
      ['#roto-main', main.url],
      ['#roto-side', side.url],
    ]);
  });

  it('says when there are no webhooks yet', async () => {
    const { page } = await openPage([]);

    expect(page.textContent).toContain('No webhooks yet.');
  });

  it('adds a webhook', async () => {
    const { fixture, page } = await openPage([main]);
    const form = page.querySelector('form.add')!;
    fill(form.querySelector('[name="name"]')!, '#roto-side');
    fill(form.querySelector('[name="url"]')!, side.url);
    button(form, 'Add').click();

    const req = await vi.waitFor(() => http.expectOne('/api/admin/webhooks'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ name: '#roto-side', url: side.url });
    req.flush(side, { status: 201, statusText: 'Created' });
    await reloaded(fixture, [main, side]);

    expect(rows(page)).toEqual([
      ['#roto-main', main.url],
      ['#roto-side', side.url],
    ]);
    expect(form.querySelector<HTMLInputElement>('[name="name"]')?.value).toBe('');
    expect(form.querySelector<HTMLInputElement>('[name="url"]')?.value).toBe('');
  });

  it('says why a webhook could not be added', async () => {
    const { fixture, page } = await openPage([]);
    button(page.querySelector('form.add')!, 'Add').click();

    (await vi.waitFor(() => http.expectOne('/api/admin/webhooks'))).flush(
      { error: 'invalid', message: 'Give the webhook a name.' },
      { status: 400, statusText: 'Bad Request' },
    );
    await fixture.whenStable();

    expect(page.querySelector('[role="alert"]')?.textContent).toContain('Give the webhook a name.');
  });

  it('renames a webhook', async () => {
    const { fixture, page } = await openPage([main]);
    const li = row(page, '#roto-main');
    fill(li.querySelector('input')!, '#roto-league');
    button(li, 'Rename').click();

    const req = await vi.waitFor(() => http.expectOne(`/api/admin/webhooks/${main.id}`));
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ name: '#roto-league' });
    const renamed = { ...main, name: '#roto-league' };
    req.flush(renamed);
    await reloaded(fixture, [renamed]);

    expect(rows(page)).toEqual([['#roto-league', main.url]]);
  });

  it('says why a rename was refused', async () => {
    const { fixture, page } = await openPage([main, side]);
    const li = row(page, '#roto-main');
    fill(li.querySelector('input')!, '#roto-side');
    button(li, 'Rename').click();

    (await vi.waitFor(() => http.expectOne(`/api/admin/webhooks/${main.id}`))).flush(
      { error: 'name-taken', message: 'Another webhook is called #roto-side.' },
      { status: 409, statusText: 'Conflict' },
    );
    await fixture.whenStable();

    expect(page.querySelector('[role="alert"]')?.textContent).toContain(
      'Another webhook is called #roto-side.',
    );
  });

  it('removes a webhook once the admin confirms', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { fixture, page } = await openPage([main, side]);
    button(row(page, '#roto-main'), 'Remove').click();

    expect(confirm).toHaveBeenCalledWith(
      'Remove #roto-main? Drafts that announce there will announce nowhere.',
    );
    const req = await vi.waitFor(() => http.expectOne(`/api/admin/webhooks/${main.id}`));
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await reloaded(fixture, [side]);

    expect(rows(page)).toEqual([['#roto-side', side.url]]);
  });

  it('keeps a webhook the admin did not confirm removing', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { fixture, page } = await openPage([main]);
    button(row(page, '#roto-main'), 'Remove').click();
    await fixture.whenStable();

    http.expectNone(`/api/admin/webhooks/${main.id}`);
  });

  it('links app admins to it from the header', async () => {
    const { fixture, page } = await open('/', carol);
    http.expectOne('/api/drafts').flush([]);
    await fixture.whenStable();

    const link = page.querySelector<HTMLAnchorElement>('header a[href="/admin/webhooks"]');
    expect(link?.textContent).toContain('Webhooks');
  });

  it('is only for app admins', async () => {
    const { fixture, page } = await open('/admin/webhooks', alice);
    await vi.waitFor(() => expect(router.url).toBe('/'));
    http.expectOne('/api/drafts').flush([]);
    await fixture.whenStable();

    expect(page.querySelector('header a[href="/admin/webhooks"]')).toBeNull();
    http.expectNone('/api/admin/webhooks');
  });
});
