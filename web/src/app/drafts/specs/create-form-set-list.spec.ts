import { TestBed } from '@angular/core/testing';
import {
  MAX_SET_LIST_SETS,
  type DraftCreationProblem,
  type SetCatalogView,
  type SetOptionView,
} from 'contract';
import {
  useDraftsApp,
  alertIn,
  button,
  controlByLabel,
  group,
  http,
  namedList,
  openUrl,
  toggleButton,
  toggleButtons,
  typeInto,
  wait,
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
const [big, otp, yotj] = otj.sublists;
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

/** The request for the sets on Arena, the platform the form starts on. */
const ARENA_SETS_URL = '/api/sets?platform=Arena';
/** What the picker says when asking again for the sets fails. */
const REREAD_FAILED = 'Couldn’t check for more sets; asking again.';

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

/** What a set's or sublist's toggle button is named: its code, name and card count. */
const nameOf = ({ code, name, cards }: { code: string; name: string; cards: number }) =>
  `${code.toUpperCase()} ${name} ${cards} cards`;
/** A set or sublist as `toggleButtons` lists it, pressed or not. */
const shown = (option: Parameters<typeof nameOf>[0], pressed = false) =>
  `${pressed ? '☑' : '☐'} ${nameOf(option)}`;
/** The toggle button for the set named `name` (its code, name and card count) in the list of sets. */
const setToggle = (page: HTMLElement, name: string) => toggleButton(namedList(page, 'Sets'), name);
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

/** Chooses the platform named `name` on the form. */
function choosePlatform(page: HTMLElement, name: string) {
  const platform = controlByLabel(page, 'combobox', 'Platform')!;
  platform.selectedIndex = [...platform.options].findIndex((option) => option.text.trim() === name);
  platform.dispatchEvent(new Event('change'));
}

const stopHere = (req: ReturnType<typeof http.expectOne>) =>
  req.flush({ error: 'invalid', message: 'Stop here.' } satisfies DraftCreationProblem, {
    status: 400,
    statusText: 'Error',
  });

describe('choosing a set list on the create form', () => {
  it('offers the sets on the platform, newest first, each with how many cards it adds', async () => {
    const { page } = await openSets();

    expect(toggleButtons(namedList(page, 'Sets'))).toEqual([shown(otj), shown(mkm)]);
  });

  it('shows a chosen set’s sublists, with its bonus sheets included and its add-ons not', async () => {
    const { fixture, page } = await openSets();

    setToggle(page, nameOf(otj))!.click();
    await fixture.whenStable();

    expect(toggleButtons(group(page, 'OTJ sublists')!)).toEqual([
      shown(big, true),
      shown(otp, true),
      shown(yotj),
    ]);
  });

  it('presses a sublist’s toggle button when it is included, and lets it go when pressed again', async () => {
    const { fixture, page } = await openSets();
    setToggle(page, nameOf(otj))!.click();
    await fixture.whenStable();
    const sublists = group(page, 'OTJ sublists')!;

    toggleButton(sublists, nameOf(yotj))!.click();
    await fixture.whenStable();
    expect(toggleButtons(sublists)).toEqual([
      shown(big, true),
      shown(otp, true),
      shown(yotj, true),
    ]);

    toggleButton(sublists, nameOf(yotj))!.click();
    await fixture.whenStable();
    expect(toggleButtons(sublists)).toEqual([shown(big, true), shown(otp, true), shown(yotj)]);
  });

  it('sends the sets chosen, each with the sublists included', async () => {
    const { fixture, page } = await openSets();
    setToggle(page, nameOf(otj))!.click();
    setToggle(page, nameOf(mkm))!.click();
    await fixture.whenStable();
    const sublists = group(page, 'OTJ sublists')!;
    toggleButton(sublists, nameOf(otp))!.click();
    toggleButton(sublists, nameOf(yotj))!.click();
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

  it('presses a set’s toggle button when it is chosen, and lets it go when pressed again', async () => {
    const { fixture, page } = await openSets();

    setToggle(page, nameOf(otj))!.click();
    await fixture.whenStable();
    expect(toggleButtons(namedList(page, 'Sets'))).toEqual([shown(otj, true), shown(mkm)]);

    setToggle(page, nameOf(otj))!.click();
    await fixture.whenStable();
    expect(toggleButtons(namedList(page, 'Sets'))).toEqual([shown(otj), shown(mkm)]);
  });

  it('drops a set and its sublists when it is unchosen', async () => {
    const { fixture, page } = await openSets();
    setToggle(page, nameOf(otj))!.click();
    setToggle(page, nameOf(mkm))!.click();
    await fixture.whenStable();

    setToggle(page, nameOf(otj))!.click();
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
    expect(toggleButtons(namedList(page, 'Sets'))).toEqual([shown(mkm)]);

    find.value = 'MIR';
    find.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(toggleButtons(namedList(page, 'Sets'))).toEqual([shown(mir)]);
  });

  it('finds the sets the Printing picker would: part of a code or name, whatever its case', async () => {
    const { page } = await openSets(catalog([otj, mkm, mir]));
    const find = controlByLabel(page, 'textbox', 'Find a set')!;

    typeInto(find, 'Tj');
    expect(toggleButtons(namedList(page, 'Sets'))).toEqual([shown(otj)]);

    typeInto(find, 'thunder');
    expect(toggleButtons(namedList(page, 'Sets'))).toEqual([shown(otj)]);

    typeInto(find, ' otj ');
    expect(toggleButtons(namedList(page, 'Sets'))).toEqual([shown(otj)]);

    typeInto(find, 'zzz');
    expect(toggleButtons(namedList(page, 'Sets'))).toEqual([]);
  });

  it('keeps a chosen set chosen while the search hides it', async () => {
    const { fixture, page } = await openSets();
    setToggle(page, nameOf(otj))!.click();
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
    setToggle(page, nameOf(otj))!.click();
    setToggle(page, nameOf(mkm))!.click();
    await fixture.whenStable();

    choosePlatform(page, 'MTGO');
    await answerSets('MTGO', catalog([mkm, mir]));
    await fixture.whenStable();

    expect(toggleButtons(namedList(page, 'Sets'))).toEqual([shown(mkm, true), shown(mir)]);
    const req = await create(fixture, page);
    expect(req.request.body.poolSource.setList).toEqual([{ code: 'mkm', sublists: [] }]);
    stopHere(req);
  });

  it('shows no sublists for a chosen set that has none', async () => {
    const { fixture, page } = await openSets();

    setToggle(page, nameOf(mkm))!.click();
    await fixture.whenStable();

    expect(group(page, 'MKM sublists')).toBeNull();
  });

  it('keeps only the sublists the platform chosen offers of a set on both platforms', async () => {
    const { fixture, page } = await openSets();
    setToggle(page, nameOf(otj))!.click();
    await fixture.whenStable();

    choosePlatform(page, 'MTGO');
    await answerSets('MTGO', catalog([{ ...otj, sublists: [big, yotj] }, mir]));
    await fixture.whenStable();

    expect(page.textContent).toContain('Chosen: OTJ (+ BIG)');
    expect(toggleButtons(group(page, 'OTJ sublists')!)).toEqual([shown(big, true), shown(yotj)]);
    const req = await create(fixture, page);
    expect(req.request.body.poolSource.setList).toEqual([{ code: 'otj', sublists: ['big'] }]);
    stopHere(req);
  });

  it('says so while the sets load, and keeps them on show while it asks again as they are counted', async () => {
    const { fixture, page } = await openUrl('/drafts/new');
    await fixture.whenStable();
    controlByLabel(page, 'radio', 'Sets')!.click();
    const first = await vi.waitFor(() => http.expectOne(ARENA_SETS_URL));
    await vi.waitFor(() => {
      TestBed.tick();
      expect(page.textContent).toContain('Loading the sets on Arena…');
    });

    first.flush(catalog([otj], true));
    const again = await vi.waitFor(() => http.expectOne(ARENA_SETS_URL));
    TestBed.tick();

    expect(page.textContent).not.toContain('Loading the sets');
    expect(toggleButtons(namedList(page, 'Sets'))).toEqual([shown(otj)]);
    again.flush(catalog([otj, mkm]));
    await fixture.whenStable();
  });

  it('stops asking for the sets on a platform once another is chosen', async () => {
    const { fixture, page } = await openUrl('/drafts/new');
    await fixture.whenStable();
    controlByLabel(page, 'radio', 'Sets')!.click();
    const arena = await vi.waitFor(() => http.expectOne(ARENA_SETS_URL));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      arena.flush(catalog([otj], true));
      await fixture.whenStable();
      expect(page.textContent).toContain('Still counting cards on Scryfall');

      // Answered before the ask on Arena falls due, so that a stale ask would go to MTGO.
      choosePlatform(page, 'MTGO');
      TestBed.tick();
      http.expectOne('/api/sets?platform=MTGO').flush(catalog([mkm]));
      await fixture.whenStable();
      wait(10);

      http.expectNone('/api/sets?platform=MTGO');
    } finally {
      vi.useRealTimers();
    }
  });

  it('says while the sets are still being counted, and asks again until they are', async () => {
    const { fixture, page } = await openSets(catalog([otj], true));
    expect(page.textContent).toContain('Still counting cards on Scryfall');

    await answerSets('Arena', catalog([otj, mkm]));
    await fixture.whenStable();

    expect(page.textContent).not.toContain('Still counting cards on Scryfall');
    expect(toggleButtons(namedList(page, 'Sets'))).toHaveLength(2);
  });

  it('keeps the sets and what was chosen through a failed re-read, and asks again until they are counted', async () => {
    const { fixture, page } = await openSets(catalog([otj], true));
    setToggle(page, nameOf(otj))!.click();
    await fixture.whenStable();

    (await vi.waitFor(() => http.expectOne(ARENA_SETS_URL))).flush(
      { message: 'Internal server error' },
      { status: 500, statusText: 'Internal Server Error' },
    );
    await fixture.whenStable();

    expect(toggleButtons(namedList(page, 'Sets'))).toEqual([shown(otj, true)]);
    expect(toggleButtons(group(page, 'OTJ sublists')!)).toEqual([
      shown(big, true),
      shown(otp, true),
      shown(yotj),
    ]);
    expect(page.textContent).toContain(REREAD_FAILED);
    expect(page.textContent).not.toContain('Scryfall.');

    await answerSets('Arena', catalog([otj, mkm]));
    await fixture.whenStable();

    expect(page.textContent).not.toContain(REREAD_FAILED);
    expect(toggleButtons(namedList(page, 'Sets'))).toEqual([shown(otj, true), shown(mkm)]);
  });

  it('drops chosen sets the platform doesn’t offer only once a read says every set is counted', async () => {
    const { fixture, page } = await openSets(catalog([otj, mkm], true));
    setToggle(page, nameOf(otj))!.click();
    setToggle(page, nameOf(mkm))!.click();
    await fixture.whenStable();

    (await vi.waitFor(() => http.expectOne(ARENA_SETS_URL))).flush(
      { message: 'Internal server error' },
      { status: 500, statusText: 'Internal Server Error' },
    );
    await fixture.whenStable();
    expect(page.textContent).toContain('Chosen: OTJ (+ BIG, OTP), MKM.');

    await answerSets('Arena', catalog([mkm]));
    await fixture.whenStable();
    expect(page.textContent).toContain('Chosen: MKM.');
  });

  it('offers no more sets once as many are chosen as a set list can hold', async () => {
    const many = Array.from({ length: MAX_SET_LIST_SETS + 2 }, (_, i) => ({
      ...mir,
      code: `s${i}`,
      name: `Set ${i}`,
    }));
    const { fixture, page } = await openSets(catalog(many));
    const chosen = many.slice(0, MAX_SET_LIST_SETS);
    const unchosen = many.slice(MAX_SET_LIST_SETS);

    for (const set of chosen) {
      setToggle(page, nameOf(set))!.click();
    }
    await fixture.whenStable();

    expect(unchosen.map((set) => setToggle(page, nameOf(set))!.disabled)).toEqual([true, true]);
    expect(chosen.every((set) => !setToggle(page, nameOf(set))!.disabled)).toBe(true);
    expect(page.textContent).toContain(`A set list holds at most ${MAX_SET_LIST_SETS} sets.`);
  });

  it('says when the sets fail to load, and asks again on Try again', async () => {
    const { fixture, page } = await openUrl('/drafts/new');
    await fixture.whenStable();
    const name = controlByLabel(page, 'textbox', 'Name')!;
    typeInto(name, 'Spring 2024');
    controlByLabel(page, 'radio', 'Sets')!.click();

    (await vi.waitFor(() => http.expectOne(ARENA_SETS_URL))).flush(
      { message: 'Internal server error' },
      { status: 500, statusText: 'Internal Server Error' },
    );
    await fixture.whenStable();

    expect(alertIn(page)?.textContent?.trim()).toBe('Couldn’t load the sets.');
    expect(page.textContent).not.toMatch(/reload/i);
    expect(name.value).toBe('Spring 2024');

    button(page, 'Try again')!.click();
    const again = await vi.waitFor(() => http.expectOne(ARENA_SETS_URL));
    TestBed.tick();
    expect(page.textContent).toContain('Loading the sets on Arena…');
    expect(alertIn(page)).toBeNull();
    again.flush(catalog([otj, mkm]));
    await fixture.whenStable();

    expect(toggleButtons(namedList(page, 'Sets'))).toEqual([shown(otj), shown(mkm)]);
    expect(name.value).toBe('Spring 2024');
  });

  it('names Scryfall when the sets fail to load because Scryfall failed', async () => {
    const { fixture, page } = await openUrl('/drafts/new');
    await fixture.whenStable();
    controlByLabel(page, 'radio', 'Sets')!.click();

    (await vi.waitFor(() => http.expectOne(ARENA_SETS_URL))).flush(
      { error: 'scryfall-unavailable', message: 'Scryfall could not be reached.' },
      { status: 502, statusText: 'Bad Gateway' },
    );
    await fixture.whenStable();

    expect(alertIn(page)?.textContent?.trim()).toBe('Couldn’t load the sets from Scryfall.');
    expect(button(page, 'Try again')).toBeTruthy();
    expect(page.textContent).not.toMatch(/reload/i);
  });
});
