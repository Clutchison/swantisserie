import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  MAX_PICKS_PER_PLAYER,
  MIN_PICKS_PER_PLAYER,
  type DraftCreationProblem,
  type WebhookView,
} from 'contract';
import { useDraftsApp, draft, http, router, openUrl, webhooksAnswer } from './harness';

useDraftsApp();
beforeEach(() => webhooksAnswer(null));

describe('create form', () => {
  const main = { id: 'webhook-main', name: '#roto-main' };
  const side = { id: 'webhook-side', name: '#roto-side' };

  /** Opens the form with GET /api/webhooks answered by `webhooks`. */
  async function openForm(webhooks: WebhookView[] = []) {
    const { fixture, page } = await openUrl('/drafts/new');
    http.expectOne('/api/webhooks').flush(webhooks);
    await fixture.whenStable();
    return { fixture, page };
  }

  function fill(page: HTMLElement, field: string, value: string) {
    const input = page.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${field}"]`)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  const webhookOptions = (page: HTMLElement) => [
    ...page.querySelectorAll<HTMLOptionElement>('[name="webhookId"] option'),
  ];

  /** Chooses the webhook option labelled `label`. */
  function chooseWebhook(page: HTMLElement, label: string) {
    const select = page.querySelector<HTMLSelectElement>('[name="webhookId"]')!;
    select.selectedIndex = webhookOptions(page).findIndex(
      (option) => option.textContent?.trim() === label,
    );
    select.dispatchEvent(new Event('change'));
  }

  const chosenWebhook = (page: HTMLElement) =>
    page
      .querySelector<HTMLSelectElement>('[name="webhookId"]')!
      .selectedOptions[0]?.textContent?.trim();

  function submit(page: HTMLElement) {
    page.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
  }

  /** Fills in and submits the form, and returns the POST it sends. */
  async function create({ fixture, page }: Awaited<ReturnType<typeof openForm>>) {
    fill(page, 'name', 'Red dragons');
    fill(page, 'poolQuery', 't:dragon c:r');
    await fixture.whenStable();
    submit(page);
    return vi.waitFor(() => http.expectOne('/api/drafts'));
  }

  it('offers a way back to the draft list as a secondary button beside submit', async () => {
    const { page } = await openForm();

    const cancel = page.querySelector<HTMLAnchorElement>('.actions a.button.secondary')!;
    expect(cancel.textContent?.trim()).toBe('Cancel');
    expect(cancel.getAttribute('href')).toBe('/');
    expect(cancel.parentElement?.querySelector('button[type="submit"]')).not.toBeNull();
  });

  it('keeps the Scryfall search link a plain link', async () => {
    const { page } = await openForm();

    const scryfall = [...page.querySelectorAll('a')].find(
      (link) => link.textContent?.trim() === 'Scryfall search',
    )!;
    expect(scryfall.classList.contains('button')).toBe(false);
  });

  it('says so while the webhooks load, and when there are none', async () => {
    const { fixture, page } = await openUrl('/drafts/new');
    const req = http.expectOne('/api/webhooks');
    await vi.waitFor(() => {
      TestBed.tick();
      expect(page.textContent).toContain('Loading the webhooks…');
    });

    req.flush([]);
    await fixture.whenStable();
    expect(page.textContent).not.toContain('Loading the webhooks…');
    expect(page.textContent).toContain('No webhooks yet, so this draft will post nowhere.');
  });

  it('says when the webhooks fail to load, and still offers to post nowhere', async () => {
    const { fixture, page } = await openUrl('/drafts/new');
    http.expectOne('/api/webhooks').flush(null, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();

    expect(page.querySelector('.hint.error')?.textContent).toContain(
      "Couldn't load the webhooks, so this draft will post nowhere.",
    );
    expect(chosenWebhook(page)).toBe('None');
  });

  it('starts picks per player at 40', async () => {
    const { page } = await openForm();

    expect(page.querySelector<HTMLInputElement>('[name="picksPerPlayer"]')?.value).toBe('40');
  });

  it('refuses picks per player outside the range the api accepts', async () => {
    const { page } = await openForm();
    const picks = [...page.querySelectorAll('input')].find((input) =>
      [...(input.labels ?? [])].some((label) => label.textContent?.trim() === 'Picks per player'),
    )!;
    const validFor = (value: number) => {
      picks.value = String(value);
      return picks.checkValidity();
    };

    expect(validFor(MIN_PICKS_PER_PLAYER - 1)).toBe(false);
    expect(validFor(MIN_PICKS_PER_PLAYER)).toBe(true);
    expect(validFor(MAX_PICKS_PER_PLAYER)).toBe(true);
    expect(validFor(MAX_PICKS_PER_PLAYER + 1)).toBe(false);
  });

  it('creates the draft and goes to its page', async () => {
    const form = await openForm();
    fill(form.page, 'picksPerPlayer', '30');

    const req = await create(form);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      name: 'Red dragons',
      poolQuery: 't:dragon c:r',
      picksPerPlayer: 30,
      platform: 'Arena',
      webhookId: null,
    });
    req.flush(draft({ id: 'draft-9', picksPerPlayer: 30 }), {
      status: 201,
      statusText: 'Created',
    });

    await vi.waitFor(() => expect(router.url).toBe('/drafts/draft-9'));
    // The draft page is lazy-loaded, so it may ask for the draft after the URL changes.
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-9'))).flush(draft({ id: 'draft-9' }));
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-9/pool'))).flush([]);
    // The organizer's control on the draft's page loads them too.
    (await vi.waitFor(() => http.expectOne('/api/webhooks'))).flush([]);
  });

  /** Chooses where the pool comes from by its radio button's label. */
  async function choosePoolSource(
    { fixture, page }: Awaited<ReturnType<typeof openForm>>,
    label: string,
  ) {
    const radio = [...page.querySelectorAll<HTMLInputElement>('[name="poolSource"]')].find(
      (input) => input.closest('label')?.textContent?.trim() === label,
    )!;
    radio.click();
    await fixture.whenStable();
  }

  it('starts on a pool query, with no cube link field', async () => {
    const { page } = await openForm();

    expect(page.querySelector('[name="poolQuery"]')).not.toBeNull();
    expect(page.querySelector('[name="cubeLink"]')).toBeNull();
  });

  it('creates a draft from a cube link in place of a pool query', async () => {
    const form = await openForm();
    fill(form.page, 'poolQuery', 't:dragon c:r');
    await choosePoolSource(form, 'Cube link');
    expect(form.page.querySelector('[name="poolQuery"]')).toBeNull();
    fill(form.page, 'name', 'Pauper');
    fill(form.page, 'cubeLink', 'https://cubecobra.com/cube/list/thepaupercube');
    await form.fixture.whenStable();
    submit(form.page);

    const req = await vi.waitFor(() => http.expectOne('/api/drafts'));
    expect(req.request.body).toEqual({
      name: 'Pauper',
      cubeLink: 'https://cubecobra.com/cube/list/thepaupercube',
      picksPerPlayer: 40,
      platform: 'Arena',
      webhookId: null,
    });
    req.flush({ error: 'invalid', message: 'Stop here.' } satisfies DraftCreationProblem, {
      status: 400,
      statusText: 'Error',
    });
  });

  it('says a cube’s mainboard cards must be on the platform chosen', async () => {
    const form = await openForm();
    await choosePoolSource(form, 'Cube link');

    expect(form.page.querySelector('[name="cubeLink"] ~ .hint')?.textContent).toContain(
      'every card must be on Arena.',
    );
  });

  const platformSelect = (page: HTMLElement) =>
    page.querySelector<HTMLSelectElement>('[name="platform"]')!;

  /** Chooses the platform option labelled `label`. */
  function choosePlatform(page: HTMLElement, label: string) {
    const select = platformSelect(page);
    select.selectedIndex = [...select.options].findIndex(
      (option) => option.textContent?.trim() === label,
    );
    select.dispatchEvent(new Event('change'));
  }

  it('offers Arena and MTGO, starting on Arena', async () => {
    const { page } = await openForm();

    const select = platformSelect(page);
    expect([...select.options].map((option) => option.textContent?.trim())).toEqual([
      'Arena',
      'MTGO',
    ]);
    expect(select.selectedOptions[0]?.textContent?.trim()).toBe('Arena');
  });

  it('sends the platform chosen', async () => {
    const form = await openForm();
    choosePlatform(form.page, 'MTGO');

    const req = await create(form);
    expect(req.request.body.platform).toBe('MTGO');
    req.flush({ error: 'invalid', message: 'Stop here.' } satisfies DraftCreationProblem, {
      status: 400,
      statusText: 'Error',
    });
  });

  it('says the pool’s cards must be on the platform chosen', async () => {
    const { fixture, page } = await openForm();
    const hint = () => page.querySelector('[name="poolQuery"] ~ .hint')?.textContent;
    expect(hint()).toContain('they must all be on Arena.');

    choosePlatform(page, 'MTGO');
    await fixture.whenStable();

    expect(hint()).toContain('they must all be on MTGO.');
  });

  it('offers the webhooks by name, starting on the first, and sends the one chosen', async () => {
    const form = await openForm([main, side]);

    expect(webhookOptions(form.page).map((option) => option.textContent?.trim())).toEqual([
      '#roto-main',
      '#roto-side',
      'None',
    ]);
    expect(chosenWebhook(form.page)).toBe('#roto-main');
    chooseWebhook(form.page, '#roto-side');

    const req = await create(form);
    expect(req.request.body.webhookId).toBe(side.id);
    req.flush({ error: 'invalid', message: 'Stop here.' } satisfies DraftCreationProblem, {
      status: 400,
      statusText: 'Error',
    });
  });

  it('can post nowhere', async () => {
    const form = await openForm([main]);
    chooseWebhook(form.page, 'None');

    const req = await create(form);
    expect(req.request.body.webhookId).toBeNull();
    req.flush({ error: 'invalid', message: 'Stop here.' } satisfies DraftCreationProblem, {
      status: 400,
      statusText: 'Error',
    });
  });

  it('offers only None when no webhooks are registered', async () => {
    const { page } = await openForm([]);

    expect(webhookOptions(page).map((option) => option.textContent?.trim())).toEqual(['None']);
    expect(chosenWebhook(page)).toBe('None');
  });

  it('still creates a draft, posting nowhere, when the webhooks fail to load', async () => {
    const { fixture, page } = await openUrl('/drafts/new');
    http
      .expectOne('/api/webhooks')
      .flush(null, { status: 500, statusText: 'Internal Server Error' });
    await fixture.whenStable();

    expect(chosenWebhook(page)).toBe('None');
    const req = await create({ fixture, page });
    expect(req.request.body.webhookId).toBeNull();
    req.flush({ error: 'invalid', message: 'Stop here.' } satisfies DraftCreationProblem, {
      status: 400,
      statusText: 'Error',
    });
  });

  function fail(
    req: ReturnType<HttpTestingController['expectOne']>,
    status: number,
    body: DraftCreationProblem,
  ) {
    req.flush(body, { status, statusText: 'Error' });
  }

  it('lists the cards that are not on Arena', async () => {
    const form = await openForm();
    const { fixture, page } = form;

    fail(await create(form), 422, {
      error: 'not-on-platform',
      message: '2 cards in this pool query are not on Arena.',
      cards: ['Ancient Hellkite', 'Dream Pillager'],
      totalCards: 2,
    } satisfies DraftCreationProblem);
    await fixture.whenStable();

    const error = page.querySelector('.error')!;
    expect(error.textContent).toContain('2 cards in this pool query are not on Arena.');
    expect([...error.querySelectorAll('li')].map((li) => li.textContent?.trim())).toEqual([
      'Ancient Hellkite',
      'Dream Pillager',
    ]);
    expect(router.url).toBe('/drafts/new');
  });

  it('says how many more cards are not on Arena than it lists', async () => {
    const form = await openForm();
    const { fixture, page } = form;

    fail(await create(form), 422, {
      error: 'not-on-platform',
      message: '5000 cards in this pool query are not on Arena.',
      cards: ['Ancient Hellkite', 'Dream Pillager'],
      totalCards: 5000,
    } satisfies DraftCreationProblem);
    await fixture.whenStable();

    expect(page.querySelector('.error')?.textContent).toContain('…and 4998 more.');
  });

  it('shows what Scryfall said about a rejected pool query', async () => {
    const form = await openForm();
    const { fixture, page } = form;

    fail(await create(form), 422, {
      error: 'query-rejected',
      message: 'Scryfall ignored part of this pool query.',
      warnings: ['Invalid expression “foo:bar” was ignored. Unknown keyword “foo”.'],
    } satisfies DraftCreationProblem);
    await fixture.whenStable();

    const error = page.querySelector('.error')!.textContent;
    expect(error).toContain('Scryfall ignored part of this pool query.');
    expect(error).toContain('Invalid expression “foo:bar” was ignored. Unknown keyword “foo”.');
  });

  it.each<[number, DraftCreationProblem]>([
    [422, { error: 'no-cards', message: 'This pool query matches no cards.' }],
    [400, { error: 'invalid', message: 'Give the draft a name.' }],
    [
      502,
      {
        error: 'scryfall-unavailable',
        message: 'Scryfall could not be reached. Try again in a moment.',
      },
    ],
    [422, { error: 'not-a-cube-link', message: 'That isn’t a CubeCobra cube link.' }],
    [422, { error: 'cube-not-found', message: 'No public cube on CubeCobra has that id.' }],
    [
      502,
      {
        error: 'cubecobra-unavailable',
        message: 'CubeCobra could not be reached. Try again in a moment.',
      },
    ],
  ])('shows the API’s message for a %i', async (status, body) => {
    const form = await openForm();
    const { fixture, page } = form;

    fail(await create(form), status, body);
    await fixture.whenStable();

    expect(page.querySelector('.error')?.textContent).toContain(body.message);
  });

  it('still says something when the request fails without a message', async () => {
    const form = await openForm();
    const { fixture, page } = form;

    (await create(form)).error(new ProgressEvent('error'));
    await fixture.whenStable();

    expect(page.querySelector('.error')?.textContent).toContain('Creating the draft failed');
  });
});
