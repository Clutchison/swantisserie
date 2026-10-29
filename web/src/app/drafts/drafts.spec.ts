import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { App } from '../app';
import { routes } from '../app.routes';
import type { DraftView } from './drafts';

const alice = {
  id: '80351110224678912',
  name: 'Alice',
  avatarUrl: 'https://cdn.discordapp.com/embed/avatars/5.png',
  isAdmin: false,
};

function draft(fields: Partial<DraftView>): DraftView {
  return {
    id: 'draft-1',
    name: 'Red dragons',
    poolQuery: 't:dragon c:r',
    picksPerPlayer: 40,
    state: 'Lobby',
    organizer: { id: alice.id, name: alice.name },
    createdAt: '2026-10-29T12:00:00.000Z',
    ...fields,
  };
}

describe('drafts', () => {
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

  afterEach(() => http.verify());

  /** Opens `url` as Alice. */
  async function open(url: string) {
    const fixture = TestBed.createComponent(App);
    const navigation = router.navigateByUrl(url);
    (await vi.waitFor(() => http.expectOne('/api/auth/me'))).flush(alice);
    await navigation;
    TestBed.tick();
    return { fixture, page: fixture.nativeElement as HTMLElement };
  }

  /** Opens the draft list with GET /api/drafts answered by `drafts`. */
  async function openList(drafts: DraftView[]) {
    const { fixture, page } = await open('/');
    http.expectOne('/api/drafts').flush(drafts);
    await fixture.whenStable();
    return page;
  }

  function section(page: HTMLElement, heading: string): HTMLElement {
    const found = [...page.querySelectorAll('section')].find((s) =>
      s.querySelector('h2')?.textContent?.includes(heading),
    );
    if (!found) throw new Error(`No section headed ${heading}`);
    return found;
  }

  describe('draft list', () => {
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

    it('says so when there are no drafts yet', async () => {
      const page = await openList([]);

      expect(section(page, 'Active drafts').textContent).toContain('No active drafts');
      expect(section(page, 'Complete drafts').textContent).toContain('No complete drafts');
    });

    it('links to the create form', async () => {
      const page = await openList([]);

      const link = page.querySelector<HTMLAnchorElement>('a[href="/drafts/new"]');
      expect(link?.textContent).toContain('New draft');
    });
  });

  describe('create form', () => {
    async function openForm() {
      const { fixture, page } = await open('/drafts/new');
      await fixture.whenStable();
      return { fixture, page };
    }

    function fill(page: HTMLElement, field: string, value: string) {
      const input = page.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${field}"]`)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }

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

    it('starts picks per player at 40', async () => {
      const { page } = await openForm();

      expect(page.querySelector<HTMLInputElement>('[name="picksPerPlayer"]')?.value).toBe('40');
    });

    it('creates the draft and goes back to the draft list', async () => {
      const form = await openForm();
      fill(form.page, 'picksPerPlayer', '30');

      const req = await create(form);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        name: 'Red dragons',
        poolQuery: 't:dragon c:r',
        picksPerPlayer: 30,
      });
      req.flush(draft({ picksPerPlayer: 30 }), { status: 201, statusText: 'Created' });

      await vi.waitFor(() => expect(router.url).toBe('/'));
      http.expectOne('/api/drafts').flush([draft({})]);
    });

    function fail(req: ReturnType<HttpTestingController['expectOne']>, status: number, body: object) {
      req.flush(body, { status, statusText: 'Error' });
    }

    it('lists the cards that are not on Arena', async () => {
      const form = await openForm();
      const { fixture, page } = form;

      fail(await create(form), 422, {
        error: 'not-on-arena',
        message: '2 cards in this pool query are not on Arena.',
        cards: ['Ancient Hellkite', 'Dream Pillager'],
        totalCards: 2,
      });
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
        error: 'not-on-arena',
        message: '5000 cards in this pool query are not on Arena.',
        cards: ['Ancient Hellkite', 'Dream Pillager'],
        totalCards: 5000,
      });
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
      });
      await fixture.whenStable();

      const error = page.querySelector('.error')!.textContent;
      expect(error).toContain('Scryfall ignored part of this pool query.');
      expect(error).toContain('Invalid expression “foo:bar” was ignored. Unknown keyword “foo”.');
    });

    it.each([
      [422, { error: 'no-cards', message: 'This pool query matches no cards.' }],
      [400, { error: 'invalid', message: 'Give the draft a name.' }],
      [
        502,
        {
          error: 'scryfall-unavailable',
          message: 'Scryfall could not be reached. Try again in a moment.',
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
});
