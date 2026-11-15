import type { WebhookWithUrlView, WebhookRegistryProblem } from 'contract';
import {
  alertIn,
  alice,
  answer,
  button,
  byName,
  carol,
  comesBefore,
  expectFocusOn,
  focusAndClick,
  focusedControl,
  http,
  onlyAlert,
  openApp,
  openDialog,
  question,
  expectSignedOut,
  router,
  updates,
  useApp,
} from '../specs-harness';
import { appAdminButton, answerTopBar } from '../top-bar/specs-harness';
import { buttonOrder, controlsByLabel, namedList } from '../drafts/specs/harness';
import { pushToOwnRoom } from '../drafts/specs/updates-harness';

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

  /** The form that adds a webhook, by its name. */
  const addForm = (page: HTMLElement) => byName(page, 'form', 'Add a webhook')!;
  /** A field of the Add form, by its label. */
  const addField = (form: HTMLElement, label: 'Name' | 'URL') =>
    controlsByLabel(form, 'textbox', label)[0];

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
  const sideRow = (page: HTMLElement) => row(page, '#roto-side');
  const nameMissing = {
    error: 'invalid',
    message: 'Give the webhook a name.',
  } satisfies WebhookRegistryProblem;

  const newUrlField = (li: Element) =>
    li.querySelector<HTMLInputElement>('input[aria-label="New URL"]')!;

  function fill(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  /** Answers the pending request to `url` with `problem`, refusing the change. */
  async function refused(
    fixture: Awaited<ReturnType<typeof openPage>>['fixture'],
    url: string,
    problem: WebhookRegistryProblem,
    status = { status: 400, statusText: 'Bad Request' },
  ) {
    (await vi.waitFor(() => http.expectOne(url))).flush(problem, status);
    // The change settles after the fixture does.
    await vi.waitFor(() => expect(alertIn(fixture.nativeElement as HTMLElement)).not.toBeNull());
  }

  /** Expects `message` as the page's only alert, inside `li`. */
  function expectAlertIn(page: HTMLElement, li: Element, message: string) {
    const alert = onlyAlert(page);
    expect(alert.textContent).toContain(message);
    expect(li.contains(alert)).toBe(true);
  }

  /** Answers the list's re-read after a change with `webhooks`. */
  async function answerReread(
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
    const form = addForm(page);
    fill(addField(form, 'Name'), '#roto-side');
    fill(addField(form, 'URL'), side.url);
    button(form, 'Add').click();

    const req = await vi.waitFor(() => http.expectOne('/api/admin/webhooks'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ name: '#roto-side', url: side.url });
    req.flush(side, { status: 201, statusText: 'Created' });
    await answerReread(fixture, [main, side]);

    expect(rows(page)).toEqual([
      ['#roto-main', main.url],
      ['#roto-side', side.url],
    ]);
    expect(addField(form, 'Name').value).toBe('');
    expect(addField(form, 'URL').value).toBe('');
  });

  it('keeps focus on Add once a webhook is added', async () => {
    const { fixture, page } = await openPage([main]);
    const form = addForm(page);
    fill(addField(form, 'Name'), '#roto-side');
    fill(addField(form, 'URL'), side.url);
    const add = button(form, 'Add');
    focusAndClick(add);

    (await vi.waitFor(() => http.expectOne('/api/admin/webhooks'))).flush(side, {
      status: 201,
      statusText: 'Created',
    });
    await answerReread(fixture, [main, side]);

    await vi.waitFor(() => expectFocusOn(form, 'Add'));
  });

  it('leaves focus in the field Add was submitted from with Enter', async () => {
    const { fixture, page } = await openPage([main]);
    const form = addForm(page);
    const name = addField(form, 'Name');
    fill(name, '#roto-side');
    fill(addField(form, 'URL'), side.url);
    name.focus();
    // Enter in a field submits its form.
    name.form!.requestSubmit();

    (await vi.waitFor(() => http.expectOne('/api/admin/webhooks'))).flush(side, {
      status: 201,
      statusText: 'Created',
    });
    await answerReread(fixture, [main, side]);

    await vi.waitFor(() => expect(rows(page)).toHaveLength(2));
    expect(focusedControl()?.role).toBe('textbox');
    expect(document.activeElement).toBe(name);
  });

  it('reads the list afresh once a load sent before the change settles', async () => {
    const { page } = await openApp('/admin/webhooks', carol);
    answerTopBar(http);
    const early = http.expectOne('/api/admin/webhooks');
    const form = addForm(page);
    fill(addField(form, 'Name'), '#roto-side');
    fill(addField(form, 'URL'), side.url);
    focusAndClick(button(form, 'Add'));

    const post = await vi.waitFor(() => {
      const [sent] = http.match(
        (req) => req.method === 'POST' && req.url === '/api/admin/webhooks',
      );
      expect(sent).toBeDefined();
      return sent;
    });
    post.flush(side, { status: 201, statusText: 'Created' });
    await Promise.resolve();
    early.flush([main]);

    (await vi.waitFor(() => http.expectOne('/api/admin/webhooks'))).flush([main, side]);
    await vi.waitFor(() =>
      expect(rows(page)).toEqual([
        ['#roto-main', main.url],
        ['#roto-side', side.url],
      ]),
    );
  });

  it('offers Add before the webhooks, so a long list doesn’t push it out of view', async () => {
    const { page } = await openPage([main, side]);

    expect(comesBefore(button(page, 'Add'), namedList(page, 'Registered webhooks'))).toBe(true);
  });

  it('says why a webhook could not be added, keeping what was typed', async () => {
    const { fixture, page } = await openPage([]);
    const form = addForm(page);
    fill(addField(form, 'URL'), side.url);
    button(form, 'Add').click();

    await refused(fixture, '/api/admin/webhooks', nameMissing);

    expect(alertIn(page)?.textContent).toContain(nameMissing.message);
    expect(addField(form, 'URL').value).toBe(side.url);
  });

  it('says why a webhook could not be added before the Add form', async () => {
    const { fixture, page } = await openPage([main, side]);
    const form = addForm(page);
    button(form, 'Add').click();

    await refused(fixture, '/api/admin/webhooks', nameMissing);

    const alert = onlyAlert(page);
    expect(alert.textContent).toContain(nameMissing.message);
    expect(comesBefore(alert, form)).toBe(true);
  });

  it('says saving failed when no reason comes back', async () => {
    const { page } = await openPage([main]);
    const failed = 'Saving failed. Check your connection and try again.';

    button(mainRow(page), 'Rename').click();
    (await vi.waitFor(() => http.expectOne(`/api/admin/webhooks/${main.id}`))).error(
      new ProgressEvent('error'),
    );
    await vi.waitFor(() => expect(alertIn(page)?.textContent?.trim()).toBe(failed));

    button(mainRow(page), 'Rename').click();
    (await vi.waitFor(() => http.expectOne(`/api/admin/webhooks/${main.id}`))).flush(null, {
      status: 502,
      statusText: 'Bad Gateway',
    });
    await vi.waitFor(() => expect(alertIn(page)?.textContent?.trim()).toBe(failed));
  });

  it('holds every change while one saves, then takes the next', async () => {
    const { fixture, page } = await openPage([main]);
    const controls = () => [
      button(mainRow(page), 'Rename'),
      button(mainRow(page), 'Remove'),
      button(mainRow(page), 'Replace URL'),
      button(addForm(page), 'Add'),
    ];

    const changing = () => controls().map((b) => b.getAttribute('aria-disabled'));

    button(mainRow(page), 'Rename').click();
    const req = await vi.waitFor(() => http.expectOne(`/api/admin/webhooks/${main.id}`));
    await fixture.whenStable();
    expect(changing()).toEqual(['true', 'true', 'true', 'true']);
    expect(controls().some((b) => b.disabled)).toBe(false);

    for (const control of controls()) control.click();
    await fixture.whenStable();
    expect(openDialog()).toBeNull();
    http.expectNone(`/api/admin/webhooks/${main.id}`);
    http.expectNone(`/api/admin/webhooks/${main.id}/url`);
    http.expectNone('/api/admin/webhooks');

    req.flush(main);
    await answerReread(fixture, [main]);
    await vi.waitFor(() => expect(changing()).toEqual([null, null, null, null]));
  });

  it('clears the reason a change was refused once one saves', async () => {
    const { fixture, page } = await openPage([main, side]);
    button(sideRow(page), 'Rename').click();
    await refused(fixture, `/api/admin/webhooks/${side.id}`, nameMissing);
    expect(alertIn(sideRow(page))?.textContent).toContain(nameMissing.message);

    button(mainRow(page), 'Rename').click();
    (await vi.waitFor(() => http.expectOne(`/api/admin/webhooks/${main.id}`))).flush(main);
    await answerReread(fixture, [main, side]);

    expect(alertIn(page)).toBeNull();
  });

  it('holds a change to a removed webhook until the list comes back without it', async () => {
    const { page } = await openPage([main, side]);
    button(sideRow(page), 'Remove').click();
    await answer(await question('Remove #roto-side?'), 'Remove');
    (await vi.waitFor(() => http.expectOne(`/api/admin/webhooks/${side.id}`))).flush(null, {
      status: 204,
      statusText: 'No Content',
    });
    const reread = await vi.waitFor(() => http.expectOne('/api/admin/webhooks'));

    // Renamed before the list comes back without it: the removal still holds every change.
    button(sideRow(page), 'Rename').click();
    await Promise.resolve();
    http.expectNone(`/api/admin/webhooks/${side.id}`);
    reread.flush([main]);

    await vi.waitFor(() => expect(rows(page)).toEqual([['#roto-main', main.url]]));
    expect(alertIn(page)).toBeNull();
  });

  it('offers Remove, then Rename, on each webhook', async () => {
    const { page } = await openPage([main, side]);

    for (const li of [mainRow(page), row(page, '#roto-side')]) {
      expect(buttonOrder(li, 'Rename')).toEqual(['Remove', 'Rename']);
    }
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
    await answerReread(fixture, [renamed]);

    expect(rows(page)).toEqual([['#roto-league', main.url]]);
  });

  it('keeps focus on Rename once a rename settles', async () => {
    const { fixture, page } = await openPage([main, side]);
    const rename = button(mainRow(page), 'Rename');
    focusAndClick(rename);

    (await vi.waitFor(() => http.expectOne(`/api/admin/webhooks/${main.id}`))).flush(main);
    await answerReread(fixture, [main, side]);

    await vi.waitFor(() => expectFocusOn(mainRow(page), 'Rename'));
  });

  it('says why a rename was refused, in its webhook’s row', async () => {
    const { fixture, page } = await openPage([main, side]);
    const li = sideRow(page);
    fill(nameField(li)!, '#roto-main');
    button(li, 'Rename').click();

    await refused(
      fixture,
      `/api/admin/webhooks/${side.id}`,
      { error: 'name-taken', message: 'Another webhook is called #roto-main.' },
      { status: 409, statusText: 'Conflict' },
    );

    expectAlertIn(page, li, 'Another webhook is called #roto-main.');
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
    await answerReread(fixture, [replaced]);

    expect(rows(page)).toEqual([['#roto-main', newUrl]]);
    expect(mainRow(page).textContent).not.toContain('Gone');
  });

  it('keeps focus on Replace URL once a URL is replaced', async () => {
    const newUrl = 'https://discord.com/api/webhooks/1234567890/new-token';
    const { fixture, page } = await openPage([main, side]);
    fill(newUrlField(mainRow(page)), newUrl);
    const replace = button(mainRow(page), 'Replace URL');
    focusAndClick(replace);

    const replaced = { ...main, url: newUrl };
    (await vi.waitFor(() => http.expectOne(`/api/admin/webhooks/${main.id}/url`))).flush(replaced);
    await answerReread(fixture, [replaced, side]);

    await vi.waitFor(() => expectFocusOn(mainRow(page), 'Replace URL'));
  });

  it('says why a replacement URL was refused, in its webhook’s row', async () => {
    const { fixture, page } = await openPage([main, side]);
    const li = sideRow(page);
    fill(newUrlField(li), 'https://example.com/x');
    button(li, 'Replace URL').click();

    await refused(fixture, `/api/admin/webhooks/${side.id}/url`, {
      error: 'invalid',
      message: 'Paste the webhook’s URL from Discord.',
    });

    expectAlertIn(page, sideRow(page), 'Paste the webhook’s URL from Discord.');
  });

  it('removes a webhook once the app admin goes ahead', async () => {
    const { fixture, page } = await openPage([main, side]);
    const opener = button(mainRow(page), 'Remove');
    focusAndClick(opener);

    const dialog = await question('Remove #roto-main?');
    expect(dialog.textContent).toContain('Drafts that announce there will announce nowhere.');
    await answer(dialog, 'Remove');
    expectFocusOn(mainRow(page), 'Remove');
    const req = await vi.waitFor(() => http.expectOne(`/api/admin/webhooks/${main.id}`));
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await answerReread(fixture, [side]);

    expect(rows(page)).toEqual([['#roto-side', side.url]]);
    await vi.waitFor(() => expectFocusOn(row(page, '#roto-side'), 'Remove'));
  });

  it('moves focus to the nearest control before the last webhook once it is removed', async () => {
    const { fixture, page } = await openPage([main, side]);
    const opener = button(row(page, '#roto-side'), 'Remove');
    focusAndClick(opener);

    await answer(await question('Remove #roto-side?'), 'Remove');
    (await vi.waitFor(() => http.expectOne(`/api/admin/webhooks/${side.id}`))).flush(null, {
      status: 204,
      statusText: 'No Content',
    });
    await answerReread(fixture, [main]);

    await vi.waitFor(() => expectFocusOn(mainRow(page), 'Replace URL'));
  });

  it('shows a refused remove in its webhook’s row', async () => {
    const { fixture, page } = await openPage([main, side]);
    const removeRefused = { error: 'invalid', message: 'That webhook can’t be removed.' } as const;
    button(sideRow(page), 'Remove').click();
    await answer(await question('Remove #roto-side?'), 'Remove');

    await refused(fixture, `/api/admin/webhooks/${side.id}`, removeRefused);

    expectAlertIn(page, sideRow(page), removeRefused.message);
  });

  it('keeps a webhook the app admin thinks better of removing, and focus on Remove', async () => {
    const { fixture, page } = await openPage([main, side]);
    const opener = button(mainRow(page), 'Remove');
    focusAndClick(opener);

    await answer(await question('Remove #roto-main?'), 'Cancel');
    await fixture.whenStable();

    http.expectNone(`/api/admin/webhooks/${main.id}`);
    await vi.waitFor(() => expectFocusOn(mainRow(page), 'Remove'));
  });

  it('leaves the webhook in place when the session ends while its Remove question is open', async () => {
    const { fixture, page } = await openPage([main]);
    button(mainRow(page), 'Remove').click();
    await question('Remove #roto-main?');

    pushToOwnRoom(updates, { type: 'unauthorized' });

    await expectSignedOut(fixture, { router, http, user: carol, returnTo: '/admin/webhooks' });
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
    await fixture.whenStable();

    expect(page.querySelector('header')?.textContent).not.toContain('App admin');
    expect(page.querySelector('header a[href="/admin/webhooks"]')).toBeNull();
    http.expectNone('/api/admin/webhooks');
  });
});
