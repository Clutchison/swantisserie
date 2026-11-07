import {
  MAX_SET_LIST_SETS,
  type DraftCreationProblem,
  type SetCatalogView,
  type SetOptionView,
} from 'contract';
import {
  useDraftsApp,
  button,
  checkboxes,
  controlByLabel,
  group,
  http,
  namedList,
  openUrl,
  webhooksAnswer,
} from './harness';

useDraftsApp();
beforeEach(() => webhooksAnswer([]));

const otj: SetOptionView = {
  code: 'otj',
  name: 'Outlaws of Thunder Junction',
  releasedAt: '2024-04-19',
  cards: 276,
  sublists: [
    { code: 'big', name: 'The Big Score', cards: 30, includedByDefault: true },
    { code: 'otp', name: 'Breaking News', cards: 65, includedByDefault: true },
    { code: 'yotj', name: 'Alchemy: Thunder Junction', cards: 30, includedByDefault: false },
  ],
};
const mkm: SetOptionView = {
  code: 'mkm',
  name: 'Murders at Karlov Manor',
  releasedAt: '2024-02-09',
  cards: 286,
  sublists: [],
};
const mir: SetOptionView = {
  code: 'mir',
  name: 'Mirage',
  releasedAt: '1996-10-08',
  cards: 335,
  sublists: [],
};

const catalog = (sets: SetOptionView[], counting = false): SetCatalogView => ({ sets, counting });

/** Opens the create form and chooses Sets as the pool source, answering the sets on Arena with `arena`. */
async function openSets(arena: SetCatalogView = catalog([otj, mkm])) {
  const { fixture, page } = await openUrl('/drafts/new');
  await fixture.whenStable();
  // The sets are asked for at once: the page isn't stable until they're answered.
  controlByLabel(page, 'radio', 'Sets')!.click();
  await answerSets('Arena', arena);
  await fixture.whenStable();
  return { fixture, page };
}

/** Answers the next request for the sets on `platform`. */
async function answerSets(platform: string, answer: SetCatalogView) {
  (await vi.waitFor(() => http.expectOne(`/api/sets?platform=${platform}`))).flush(answer);
}

const checkbox = (root: HTMLElement, label: string) => controlByLabel(root, 'checkbox', label);
const setBox = (page: HTMLElement, label: string) => checkbox(namedList(page, 'Sets'), label);
/** Fills in the name, submits the form and returns the POST it sends. */
async function create(fixture: Awaited<ReturnType<typeof openSets>>['fixture'], page: HTMLElement) {
  const name = controlByLabel(page, 'textbox', 'Name')!;
  name.value = 'Spring 2024';
  name.dispatchEvent(new Event('input'));
  await fixture.whenStable();
  button(page, 'Create draft')!.click();
  const req = await vi.waitFor(() => http.expectOne('/api/drafts'));
  return req;
}

const stopHere = (req: ReturnType<typeof http.expectOne>) =>
  req.flush({ error: 'invalid', message: 'Stop here.' } satisfies DraftCreationProblem, {
    status: 400,
    statusText: 'Error',
  });

describe('choosing a set list on the create form', () => {
  it('offers the sets on the platform, newest first, each with how many cards it adds', async () => {
    const { page } = await openSets();

    expect(checkboxes(namedList(page, 'Sets'))).toEqual([
      '☐ OTJ Outlaws of Thunder Junction 276 cards',
      '☐ MKM Murders at Karlov Manor 286 cards',
    ]);
  });

  it('shows a chosen set’s sublists, with its bonus sheets included and its add-ons not', async () => {
    const { fixture, page } = await openSets();

    setBox(page, 'OTJ Outlaws of Thunder Junction')!.click();
    await fixture.whenStable();

    expect(checkboxes(group(page, 'OTJ sublists')!)).toEqual([
      '☑ BIG The Big Score 30 cards',
      '☑ OTP Breaking News 65 cards',
      '☐ YOTJ Alchemy: Thunder Junction 30 cards',
    ]);
  });

  it('sends the sets chosen, each with the sublists included', async () => {
    const { fixture, page } = await openSets();
    setBox(page, 'OTJ Outlaws of Thunder Junction')!.click();
    setBox(page, 'MKM Murders at Karlov Manor')!.click();
    await fixture.whenStable();
    const sublists = group(page, 'OTJ sublists')!;
    checkbox(sublists, 'OTP Breaking News')!.click();
    checkbox(sublists, 'YOTJ Alchemy: Thunder Junction')!.click();
    await fixture.whenStable();

    const req = await create(fixture, page);

    expect(req.request.body.poolSource).toEqual({
      kind: 'set-list',
      setList: [
        { code: 'otj', sublists: ['big', 'yotj'] },
        { code: 'mkm', sublists: [] },
      ],
    });
    stopHere(req);
  });

  it('drops a set and its sublists when it is unchosen', async () => {
    const { fixture, page } = await openSets();
    setBox(page, 'OTJ Outlaws of Thunder Junction')!.click();
    setBox(page, 'MKM Murders at Karlov Manor')!.click();
    await fixture.whenStable();

    setBox(page, 'OTJ Outlaws of Thunder Junction')!.click();
    await fixture.whenStable();

    expect(group(page, 'OTJ sublists')).toBeNull();
    const req = await create(fixture, page);
    expect(req.request.body.poolSource.setList).toEqual([{ code: 'mkm', sublists: [] }]);
    stopHere(req);
  });

  it('finds a set by its code or name', async () => {
    const { fixture, page } = await openSets(catalog([otj, mkm, mir]));
    const find = controlByLabel(page, 'textbox', 'Find a set')!;

    find.value = 'karlov';
    find.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(checkboxes(namedList(page, 'Sets'))).toEqual([
      '☐ MKM Murders at Karlov Manor 286 cards',
    ]);

    find.value = 'MIR';
    find.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(checkboxes(namedList(page, 'Sets'))).toEqual(['☐ MIR Mirage 335 cards']);
  });

  it('keeps a chosen set chosen while the search hides it', async () => {
    const { fixture, page } = await openSets();
    setBox(page, 'OTJ Outlaws of Thunder Junction')!.click();
    await fixture.whenStable();
    const find = controlByLabel(page, 'textbox', 'Find a set')!;
    find.value = 'karlov';
    find.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    expect(page.textContent).toContain('Chosen: OTJ (+ BIG, OTP)');
    const req = await create(fixture, page);
    expect(req.request.body.poolSource.setList).toEqual([
      { code: 'otj', sublists: ['big', 'otp'] },
    ]);
    stopHere(req);
  });

  it('offers the sets on MTGO once MTGO is chosen, dropping chosen sets not on it', async () => {
    const { fixture, page } = await openSets();
    setBox(page, 'OTJ Outlaws of Thunder Junction')!.click();
    setBox(page, 'MKM Murders at Karlov Manor')!.click();
    await fixture.whenStable();

    const platform = controlByLabel(page, 'combobox', 'Platform')!;
    platform.selectedIndex = 1;
    platform.dispatchEvent(new Event('change'));
    await answerSets('MTGO', catalog([mkm, mir]));
    await fixture.whenStable();

    expect(checkboxes(namedList(page, 'Sets'))).toEqual([
      '☑ MKM Murders at Karlov Manor 286 cards',
      '☐ MIR Mirage 335 cards',
    ]);
    const req = await create(fixture, page);
    expect(req.request.body.poolSource.setList).toEqual([{ code: 'mkm', sublists: [] }]);
    stopHere(req);
  });

  it('says while the sets are still being counted, and asks again until they are', async () => {
    const { fixture, page } = await openSets(catalog([otj], true));
    expect(page.textContent).toContain('Still counting cards on Scryfall');

    await answerSets('Arena', catalog([otj, mkm]));
    await fixture.whenStable();

    expect(page.textContent).not.toContain('Still counting cards on Scryfall');
    expect(checkboxes(namedList(page, 'Sets'))).toHaveLength(2);
  });

  it('offers no more sets once as many are chosen as a set list can hold', async () => {
    const many = Array.from({ length: MAX_SET_LIST_SETS + 1 }, (_, i) => ({
      ...mir,
      code: `s${i}`,
      name: `Set ${i}`,
    }));
    const { fixture, page } = await openSets(catalog(many));

    for (const set of many.slice(0, MAX_SET_LIST_SETS)) {
      setBox(page, `${set.code.toUpperCase()} ${set.name}`)!.click();
    }
    await fixture.whenStable();

    const last = many[MAX_SET_LIST_SETS];
    expect(setBox(page, `${last.code.toUpperCase()} ${last.name}`)!.disabled).toBe(true);
    expect(setBox(page, 'S0 Set 0')!.disabled).toBe(false);
    expect(page.textContent).toContain(`A set list holds at most ${MAX_SET_LIST_SETS} sets.`);
  });

  it('says when the sets fail to load', async () => {
    const { fixture, page } = await openUrl('/drafts/new');
    await fixture.whenStable();
    controlByLabel(page, 'radio', 'Sets')!.click();

    (await vi.waitFor(() => http.expectOne('/api/sets?platform=Arena'))).flush(
      { error: 'scryfall-unavailable', message: 'Scryfall could not be reached.' },
      { status: 502, statusText: 'Bad Gateway' },
    );
    await fixture.whenStable();

    expect(page.textContent).toContain('Couldn’t load the sets from Scryfall.');
  });
});
