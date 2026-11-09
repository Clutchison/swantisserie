import type { WebhookWithUrlView, WebhookRegistryProblem } from 'contract';
import {
  alertIn,
  alice,
  answer,
  carol,
  http,
  openApp,
  question,
  router,
  useApp,
} from '../specs-harness';
import { appAdminButton, answerTopBar } from '../top-bar/specs-harness';

const main: WebhookWithUrlView = {
  id: 'webhook-main',
  name: '#roto-main',
  url: 'https://discord.com/api/webhooks/1234567890/main-token',
  gone: false,
};
const side: WebhookWithUrlView = {
  id: 'webhook-side',
  name: '#roto-side',
  url: 'https://discord.com/api/webhooks/1234567891/side-token',
  gone: false,
};

describe('webhooks page', () => {
  useApp();

  /** Opens the page as Carol, an app admin, with `webhooks` registered. */
  async function openPage(webhooks: WebhookWithUrlView[]) {
    const opened = await openApp('/admin/webhooks', carol);
    answerTopBar(http);
    http.expectOne('/api/admin/webhooks').flush(webhooks);
    await opened.fixture.whenStable();
    return opened;
  }

  const nameField = (li: Element) => li.querySelector<HTMLInputElement>('input[aria-label="Name"]');

  /** The list's rows, as their name field's value and their URL. */
  const rows = (page: HTMLElement) =>
    [...page.querySelectorAll('li')].map((li) => [
      nameField(li)?.value,
      li.querySelector('.url')?.textContent?.trim(),
    ]);

  const row = (page: HTMLElement, name: string) =>
    [...page.querySelectorAll('li')].find((li) => nameField(li)?.value === name)!;
  const mainRow = (page: HTMLElement) => row(page, '#roto-main');
  const nameMissing = {
    error: 'invalid',
    message: 'Give the webhook a name.',
  } satisfies WebhookRegistryProblem;

  const newUrlField = (li: Element) =>
    li.querySelector<HTMLInputElement>('input[aria-label="New URL"]')!;

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
    webhooks: WebhookWithUrlView[],
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

  it('says why a webhook could not be added, keeping what was typed', async () => {
    const { fixture, page } = await openPage([]);
    const form = page.querySelector('form.add')!;
    fill(form.querySelector('[name="url"]')!, side.url);
    button(form, 'Add').click();

    (await vi.waitFor(() => http.expectOne('/api/admin/webhooks'))).flush(nameMissing, {
      status: 400,
      statusText: 'Bad Request',
    });
    await fixture.whenStable();

    expect(alertIn(page)?.textContent).toContain(nameMissing.message);
    expect(form.querySelector<HTMLInputElement>('[name="url"]')?.value).toBe(side.url);
  });

  it('says saving failed when no reason comes back', async () => {
    const { fixture, page } = await openPage([main]);
    const failed = 'Saving failed. Check your connection and try again.';

    button(mainRow(page), 'Rename').click();
    (await vi.waitFor(() => http.expectOne(`/api/admin/webhooks/${main.id}`))).error(
      new ProgressEvent('error'),
    );
    await fixture.whenStable();
    expect(alertIn(page)?.textContent?.trim()).toBe(failed);

    button(mainRow(page), 'Rename').click();
    (await vi.waitFor(() => http.expectOne(`/api/admin/webhooks/${main.id}`))).flush(null, {
      status: 502,
      statusText: 'Bad Gateway',
    });
    await fixture.whenStable();
    expect(alertIn(page)?.textContent?.trim()).toBe(failed);
  });

  it('holds every change while one saves, then takes the next', async () => {
    const { fixture, page } = await openPage([main]);
    const controls = () => [
      button(mainRow(page), 'Rename'),
      button(mainRow(page), 'Remove'),
      button(mainRow(page), 'Replace URL'),
      button(page.querySelector('form.add')!, 'Add'),
    ];

    button(mainRow(page), 'Rename').click();
    const req = await vi.waitFor(() => http.expectOne(`/api/admin/webhooks/${main.id}`));
    await fixture.whenStable();
    expect(controls().map((b) => b.disabled)).toEqual([true, true, true, true]);

    req.flush(main);
    await reloaded(fixture, [main]);
    expect(controls().map((b) => b.disabled)).toEqual([false, false, false, false]);
  });

  it('clears the reason a change was refused once one saves', async () => {
    const { fixture, page } = await openPage([main]);
    button(mainRow(page), 'Rename').click();
    (await vi.waitFor(() => http.expectOne(`/api/admin/webhooks/${main.id}`))).flush(nameMissing, {
      status: 400,
      statusText: 'Bad Request',
    });
    await fixture.whenStable();

    button(mainRow(page), 'Rename').click();
    (await vi.waitFor(() => http.expectOne(`/api/admin/webhooks/${main.id}`))).flush(main);
    await reloaded(fixture, [main]);

    expect(alertIn(page)).toBeNull();
  });

  it('renames a webhook', async () => {
    const { fixture, page } = await openPage([main]);
    const li = mainRow(page);
    fill(nameField(li)!, '#roto-league');
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
    const li = mainRow(page);
    fill(nameField(li)!, '#roto-side');
    button(li, 'Rename').click();

    (await vi.waitFor(() => http.expectOne(`/api/admin/webhooks/${main.id}`))).flush(
      {
        error: 'name-taken',
        message: 'Another webhook is called #roto-side.',
      } satisfies WebhookRegistryProblem,
      { status: 409, statusText: 'Conflict' },
    );
    await fixture.whenStable();

    expect(alertIn(page)?.textContent).toContain('Another webhook is called #roto-side.');
  });

  it('marks gone webhooks', async () => {
    const { page } = await openPage([{ ...main, gone: true }, side]);

    expect(mainRow(page).textContent).toContain('Gone');
    expect(row(page, '#roto-side').textContent).not.toContain('Gone');
  });

  it('replaces a gone webhook’s URL', async () => {
    const newUrl = 'https://discord.com/api/webhooks/1234567890/new-token';
    const { fixture, page } = await openPage([{ ...main, gone: true }]);
    const li = mainRow(page);
    fill(newUrlField(li), newUrl);
    button(li, 'Replace URL').click();

    const req = await vi.waitFor(() => http.expectOne(`/api/admin/webhooks/${main.id}/url`));
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ url: newUrl });
    const replaced = { ...main, url: newUrl };
    req.flush(replaced);
    await reloaded(fixture, [replaced]);

    expect(rows(page)).toEqual([['#roto-main', newUrl]]);
    expect(mainRow(page).textContent).not.toContain('Gone');
  });

  it('says why a replacement URL was refused', async () => {
    const { fixture, page } = await openPage([main]);
    const li = mainRow(page);
    fill(newUrlField(li), 'https://example.com/x');
    button(li, 'Replace URL').click();

    (await vi.waitFor(() => http.expectOne(`/api/admin/webhooks/${main.id}/url`))).flush(
      {
        error: 'invalid',
        message: 'Paste the webhook’s URL from Discord.',
      } satisfies WebhookRegistryProblem,
      { status: 400, statusText: 'Bad Request' },
    );
    await fixture.whenStable();

    expect(alertIn(page)?.textContent).toContain('Paste the webhook’s URL from Discord.');
  });

  it('removes a webhook once the app admin goes ahead', async () => {
    const { fixture, page } = await openPage([main, side]);
    const opener = button(mainRow(page), 'Remove');
    opener.focus();
    opener.click();

    const dialog = await question('Remove #roto-main?');
    expect(dialog.textContent).toContain('Drafts that announce there will announce nowhere.');
    await answer(dialog, 'Remove');
    expect(document.activeElement).toBe(opener);
    const req = await vi.waitFor(() => http.expectOne(`/api/admin/webhooks/${main.id}`));
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await reloaded(fixture, [side]);

    expect(rows(page)).toEqual([['#roto-side', side.url]]);
  });

  it('keeps a webhook the app admin thinks better of removing', async () => {
    const { fixture, page } = await openPage([main]);
    button(mainRow(page), 'Remove').click();

    await answer(await question('Remove #roto-main?'), 'Cancel');
    await fixture.whenStable();

    http.expectNone(`/api/admin/webhooks/${main.id}`);
  });

  it('links app admins to it from the header', async () => {
    const { fixture, page } = await openApp('/', carol);
    answerTopBar(http);
    http.expectOne('/api/drafts').flush([]);
    await fixture.whenStable();

    appAdminButton(page).click();
    await fixture.whenStable();

    const link = page.querySelector<HTMLAnchorElement>('header a[href="/admin/webhooks"]');
    expect(link?.textContent).toContain('Webhooks');
  });

  it('is only for app admins', async () => {
    const { fixture, page } = await openApp('/admin/webhooks', alice);
    answerTopBar(http);
    await vi.waitFor(() => expect(router.url).toBe('/'));
    (await vi.waitFor(() => http.expectOne('/api/drafts'))).flush([]);
    await fixture.whenStable();

    expect(page.querySelector('header')?.textContent).not.toContain('App admin');
    expect(page.querySelector('header a[href="/admin/webhooks"]')).toBeNull();
    http.expectNone('/api/admin/webhooks');
  });
});
