import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  MAX_PICKS_PER_PLAYER,
  MIN_PICKS_PER_PLAYER,
  type DraftCreationProblem,
  type WebhookView,
} from 'contract';
import {
  useDraftsApp,
  alertIn,
  button,
  controlByLabel,
  draft,
  http,
  link,
  router,
  openUrl,
  webhooksAnswer,
} from './harness';

useDraftsApp();
beforeEach(() => webhooksAnswer(null));

describe('create form', () => {
  const main = { id: 'webhook-main', name: '#roto-main', gone: false };
  const side = { id: 'webhook-side', name: '#roto-side', gone: false };

  /** Opens the form with GET /api/webhooks answered by `webhooks`. */
  async function openForm(webhooks: WebhookView[] = []) {
    const { fixture, page } = await openUrl('/drafts/new');
    http.expectOne('/api/webhooks').flush(webhooks);
    await fixture.whenStable();
    return { fixture, page };
  }

  /** The text box labelled `label`, if it's showing. */
  const textBox = (page: HTMLElement, label: string) => controlByLabel(page, 'textbox', label);
  const picksPerPlayer = (page: HTMLElement) =>
    controlByLabel(page, 'spinbutton', 'Picks per player')!;

  /** Types `value` into the text box or number field labelled `label`. */
  function fill(page: HTMLElement, label: string, value: string) {
    const input = textBox(page, label) ?? controlByLabel(page, 'spinbutton', label);
    if (!input) throw new Error(`No field labelled ${label} is showing.`);
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  const webhookSelect = (page: HTMLElement) => controlByLabel(page, 'combobox', 'Announcements')!;
  const webhookOptions = (page: HTMLElement) => [...webhookSelect(page).options];

  /** Chooses the webhook option labelled `label`. */
  function chooseWebhook(page: HTMLElement, label: string) {
    const select = webhookSelect(page);
    select.selectedIndex = webhookOptions(page).findIndex(
      (option) => option.textContent?.trim() === label,
    );
    select.dispatchEvent(new Event('change'));
  }

  const chosenWebhook = (page: HTMLElement) =>
    webhookSelect(page).selectedOptions[0]?.textContent?.trim();

  function submit(page: HTMLElement) {
    button(page, 'Create draft')!.click();
  }

  /** Fills in and submits the form, and returns the POST it sends. */
  async function create({ fixture, page }: Awaited<ReturnType<typeof openForm>>) {
    fill(page, 'Name', 'Red dragons');
    fill(page, 'Pool query', 't:dragon c:r');
    await fixture.whenStable();
    submit(page);
    return vi.waitFor(() => http.expectOne('/api/drafts'));
  }

  it('offers a way back to the draft list', async () => {
    const { fixture, page } = await openForm();

    link(page, 'Cancel')!.click();

    await vi.waitFor(() => expect(router.url).toBe('/'));
    (await vi.waitFor(() => http.expectOne('/api/drafts'))).flush([]);
    await fixture.whenStable();
  });

  it('links the pool query to Scryfall’s search syntax, in a new tab', async () => {
    const { page } = await openForm();

    const scryfall = link(page, 'Scryfall search')!;
    expect(scryfall.href).toBe('https://scryfall.com/docs/syntax');
    expect(scryfall.target).toBe('_blank');
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

    expect(page.textContent).toContain(
      "Couldn't load the webhooks, so this draft will post nowhere.",
    );
    expect(chosenWebhook(page)).toBe('None');
  });

  it('starts picks per player at 40', async () => {
    const { page } = await openForm();

    expect(picksPerPlayer(page).value).toBe('40');
  });

  it('refuses picks per player outside the range the api accepts', async () => {
    const { page } = await openForm();
    const picks = picksPerPlayer(page);
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
    fill(form.page, 'Picks per player', '30');

    const req = await create(form);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      name: 'Red dragons',
      poolSource: { kind: 'pool-query', poolQuery: 't:dragon c:r' },
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
  });

  /** Chooses where the pool comes from by its radio button's label. */
  async function choosePoolSource(
    { fixture, page }: Awaited<ReturnType<typeof openForm>>,
    label: string,
  ) {
    controlByLabel(page, 'radio', label)!.click();
    await fixture.whenStable();
  }

  it('starts with the name, pool query and cube link empty', async () => {
    const form = await openForm();

    expect(textBox(form.page, 'Name')!.value).toBe('');
    expect(textBox(form.page, 'Pool query')!.value).toBe('');
    await choosePoolSource(form, 'Cube link');
    expect(textBox(form.page, 'Cube link')!.value).toBe('');
  });

  it('starts on a pool query, with no cube link field', async () => {
    const { page } = await openForm();

    expect(controlByLabel(page, 'radio', 'Pool query')!.checked).toBe(true);
    expect(textBox(page, 'Pool query')).toBeDefined();
    expect(textBox(page, 'Cube link')).toBeUndefined();
  });

  it('shows only the field for the pool source chosen', async () => {
    const form = await openForm();

    await choosePoolSource(form, 'Cube link');
    expect(textBox(form.page, 'Cube link')).toBeDefined();
    expect(textBox(form.page, 'Pool query')).toBeUndefined();

    await choosePoolSource(form, 'Pool query');
    expect(textBox(form.page, 'Pool query')).toBeDefined();
    expect(textBox(form.page, 'Cube link')).toBeUndefined();
  });

  it('keeps what was typed for each pool source when switching between them', async () => {
    const form = await openForm();
    fill(form.page, 'Pool query', 't:dragon c:r');
    await choosePoolSource(form, 'Cube link');
    fill(form.page, 'Cube link', 'thepaupercube');

    await choosePoolSource(form, 'Pool query');
    expect(textBox(form.page, 'Pool query')!.value).toBe('t:dragon c:r');
    await choosePoolSource(form, 'Cube link');
    expect(textBox(form.page, 'Cube link')!.value).toBe('thepaupercube');
  });

  it('sends only the pool query when a cube link was typed and then left', async () => {
    const form = await openForm();
    await choosePoolSource(form, 'Cube link');
    fill(form.page, 'Cube link', 'thepaupercube');
    await choosePoolSource(form, 'Pool query');

    const req = await create(form);
    expect(req.request.body.poolSource).toEqual({ kind: 'pool-query', poolQuery: 't:dragon c:r' });
    req.flush({ error: 'invalid', message: 'Stop here.' } satisfies DraftCreationProblem, {
      status: 400,
      statusText: 'Error',
    });
  });

  it('creates a draft from a cube link in place of a pool query', async () => {
    const form = await openForm();
    fill(form.page, 'Pool query', 't:dragon c:r');
    await choosePoolSource(form, 'Cube link');
    fill(form.page, 'Name', 'Pauper');
    fill(form.page, 'Cube link', 'https://cubecobra.com/cube/list/thepaupercube');
    await form.fixture.whenStable();
    submit(form.page);

    const req = await vi.waitFor(() => http.expectOne('/api/drafts'));
    expect(req.request.body).toEqual({
      name: 'Pauper',
      poolSource: { kind: 'cube', cubeLink: 'https://cubecobra.com/cube/list/thepaupercube' },
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

    expect(textBox(form.page, 'Cube link')!.labels?.[0]?.textContent).toContain(
      'every card must be on Arena.',
    );
  });

  const platformSelect = (page: HTMLElement) => controlByLabel(page, 'combobox', 'Platform')!;

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
    const hint = () => textBox(page, 'Pool query')!.labels?.[0]?.textContent;
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

  it('lists gone webhooks but doesn’t let them be chosen, starting on the first that isn’t', async () => {
    const { page } = await openForm([{ ...main, gone: true }, side]);

    expect(webhookOptions(page).map((option) => option.textContent?.trim())).toEqual([
      '#roto-main (gone)',
      '#roto-side',
      'None',
    ]);
    expect(webhookOptions(page)[0].disabled).toBe(true);
    expect(chosenWebhook(page)).toBe('#roto-side');
  });

  it('starts on None when every webhook is gone', async () => {
    const { page } = await openForm([{ ...main, gone: true }]);

    expect(chosenWebhook(page)).toBe('None');
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

    const error = alertIn(page)!;
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

    expect(alertIn(page)?.textContent).toContain('…and 4998 more.');
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

    const error = alertIn(page)!.textContent;
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

    expect(alertIn(page)?.textContent).toContain(body.message);
  });

  it('holds Create draft while it checks the pool, forgetting the last problem, and offers it again once creating fails', async () => {
    const form = await openForm();
    const { fixture, page } = form;
    const problem: DraftCreationProblem = { error: 'invalid', message: 'Give the draft a name.' };
    fail(await create(form), 400, problem);
    await fixture.whenStable();
    await vi.waitFor(() => expect(alertIn(page)?.textContent).toContain(problem.message));
    expect(button(page, 'Create draft')!.disabled).toBe(false);

    submit(page);
    const again = await vi.waitFor(() => http.expectOne('/api/drafts'));
    await fixture.whenStable();
    expect(button(page, 'Create draft')).toBeUndefined();
    expect(button(page, 'Checking the pool…')!.disabled).toBe(true);
    expect(alertIn(page)).toBeNull();

    fail(again, 400, problem);
    await fixture.whenStable();
    await vi.waitFor(() => expect(button(page, 'Create draft')!.disabled).toBe(false));
  });

  it('says creating failed when the failure’s answer has no body', async () => {
    const form = await openForm();
    const { fixture, page } = form;

    (await create(form)).flush(null, { status: 502, statusText: 'Bad Gateway' });
    await fixture.whenStable();

    await vi.waitFor(() =>
      expect(alertIn(page)?.textContent).toContain('Creating the draft failed'),
    );
  });

  it('still says something when the request fails without a message', async () => {
    const form = await openForm();
    const { fixture, page } = form;

    (await create(form)).error(new ProgressEvent('error'));
    await fixture.whenStable();

    expect(alertIn(page)?.textContent).toContain('Creating the draft failed');
  });
});
