import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { Subject } from 'rxjs';
import { App } from '../app';
import { routes } from '../app.routes';
import { DRAFT_POLL_MS } from './draft-page';
import {
  type DraftView,
  EMPTY_QUEUE,
  type PickView,
  type PoolCardView,
  type PoolSnapshotView,
  type QueueView,
  type WebhookView,
} from './drafts';
import { type DraftUpdate, DraftUpdates } from './draft-updates';

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
    snapshot: { state: 'Complete', cards: 540, total: 540 },
    players: [],
    turn: null,
    webhook: null,
    version: 0,
    createdAt: '2026-10-29T12:00:00.000Z',
    ...fields,
  };
}

describe('drafts', () => {
  let http: HttpTestingController;
  let router: Router;
  /** Stands in for the API's Socket.IO gateway: push events through `events`. */
  let updates: { events: Subject<DraftUpdate>; watch: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    const events = new Subject<DraftUpdate>();
    updates = { events, watch: vi.fn(() => events) };
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes, withComponentInputBinding()),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: DRAFT_POLL_MS, useValue: 5 },
        { provide: DraftUpdates, useValue: updates },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => http.verify());

  /** Opens `url` as `user`: Alice, unless told otherwise. */
  async function open(url: string, user = alice) {
    const fixture = TestBed.createComponent(App);
    const navigation = router.navigateByUrl(url);
    (await vi.waitFor(() => http.expectOne('/api/auth/me'))).flush(user);
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

    it('links each draft to its page', async () => {
      const page = await openList([draft({ id: 'a', name: 'Red dragons' })]);

      const link = page.querySelector<HTMLAnchorElement>('a[href="/drafts/a"]');
      expect(link?.textContent).toContain('Red dragons');
    });
  });

  describe('draft page', () => {
    const bob = {
      id: 'bob',
      name: 'Bob',
      avatarUrl: 'https://cdn.discordapp.com/embed/avatars/1.png',
      isBot: false,
    };
    const alicePlayer = {
      id: alice.id,
      name: alice.name,
      avatarUrl: alice.avatarUrl,
      isBot: false,
    };

    /** A button in the bottom tab bar, by its label. */
    const tabButton = (root: HTMLElement, tab: string) =>
      [...root.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
        (button) => button.textContent?.trim() === tab,
      )!;
    /** The tab panel showing. */
    const panel = (root: HTMLElement) =>
      root.querySelector<HTMLElement>('[role="tabpanel"]:not([hidden])')!;

    /**
     * Opens draft-1's page with the first GET answered by `pool`, its pool
     * cards by `cards` once the snapshot is complete, and its picks by
     * `picks` once the draft has started, and their queue by `queue` if
     * they are a player, signed in as `user`.
     */
    async function openDraft(
      pool: PoolSnapshotView,
      fields: Partial<DraftView> = {},
      {
        cards = [],
        picks = [],
        queue = EMPTY_QUEUE,
        user = alice,
      }: {
        cards?: PoolCardView[];
        picks?: PickView[];
        queue?: QueueView;
        user?: typeof alice;
      } = {},
    ) {
      const { fixture, page } = await open('/drafts/draft-1', user);
      const opened = draft({ snapshot: pool, ...fields });
      http.expectOne('/api/drafts/draft-1').flush(opened);
      if (pool.state === 'Complete') await flushPool(cards);
      if (opened.state !== 'Lobby') await flushPicks(picks);
      if (opened.players.some((player) => player.id === user.id)) await flushQueue(queue);
      await fixture.whenStable();
      return { fixture, page };
    }

    /** Answers the page's GET of the signed-in player's queue with `queue`. */
    async function flushQueue(queue: QueueView) {
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/queue'))).flush(queue);
    }

    /** Answers the page's GET of draft-1's pick log with `picks`. */
    async function flushPicks(picks: PickView[]) {
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/picks'))).flush(picks);
    }

    /**
     * Answers the page's GET of draft-1's pool cards with `cards`. The page
     * isn't stable until it's answered.
     */
    async function flushPool(cards: PoolCardView[] = []) {
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/pool'))).flush(cards);
    }

    /** The next poll of the draft, answered with `pool`. */
    async function poll(fixture: { whenStable(): Promise<unknown> }, pool: PoolSnapshotView) {
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(
        draft({ snapshot: pool }),
      );
      if (pool.state === 'Complete') await flushPool();
      await fixture.whenStable();
    }

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
      expect(
        [...page.querySelectorAll('button')].some((b) => b.textContent?.includes('Retry')),
      ).toBe(false);
    });

    describe('lobby', () => {
      const complete: PoolSnapshotView = { state: 'Complete', cards: 540, total: 540 };

      function button(page: HTMLElement, label: string) {
        return [...page.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
      }

      it('lists the players with their avatars', async () => {
        const { page } = await openDraft(complete, { players: [bob, alicePlayer] });

        const players = section(page, 'Players');
        const items = [...players.querySelectorAll('li')];
        expect(items.map((li) => li.querySelector('.name')?.textContent)).toEqual(['Bob', 'Alice']);
        expect(items[0].querySelector('img')?.getAttribute('src')).toBe(bob.avatarUrl);
      });

      it('says when nobody has joined yet', async () => {
        const { page } = await openDraft(complete, { players: [] });

        expect(section(page, 'Players').textContent).toContain('Nobody has joined yet');
      });

      it('joins the draft, then offers to leave it', async () => {
        const { fixture, page } = await openDraft(complete, { players: [bob] });
        expect(button(page, 'Leave')).toBeUndefined();

        button(page, 'Join')!.click();
        const req = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/players'));
        expect(req.request.method).toBe('POST');
        req.flush(draft({ players: [bob, alicePlayer] }), { status: 201, statusText: 'Created' });
        await flushQueue(EMPTY_QUEUE);
        await fixture.whenStable();

        expect(section(page, 'Players').textContent).toContain('Alice');
        expect(button(page, 'Join')).toBeUndefined();
        button(page, 'Leave')!.click();
        const left = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/players/me'));
        expect(left.request.method).toBe('DELETE');
        left.flush(draft({ players: [bob] }));
        await fixture.whenStable();

        expect(section(page, 'Players').textContent).not.toContain('Alice');
        expect(button(page, 'Join')).toBeDefined();
      });

      it('offers neither once the draft has started', async () => {
        const { page } = await openDraft(complete, { state: 'Drafting', players: [alicePlayer] });

        expect(button(page, 'Join')).toBeUndefined();
        expect(button(page, 'Leave')).toBeUndefined();
      });

      it('shows the draft as started when a join is refused for it', async () => {
        const { fixture, page } = await openDraft(complete, { players: [bob] });

        button(page, 'Join')!.click();
        (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/players'))).flush(
          { error: 'draft-started', message: 'This draft has started.' },
          { status: 409, statusText: 'Conflict' },
        );
        // The page re-reads the draft to catch up with its new state.
        (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(
          draft({ state: 'Drafting', players: [bob] }),
        );
        await flushPicks([]);
        await fixture.whenStable();

        expect(page.querySelector('.error')?.textContent).toContain('This draft has started.');
        expect(page.textContent).toContain('Drafting');
        expect(button(page, 'Join')).toBeUndefined();
      });
    });

    describe('seats and start', () => {
      const complete: PoolSnapshotView = { state: 'Complete', cards: 540, total: 540 };

      function button(page: HTMLElement, label: string) {
        return [...page.querySelectorAll('button')].find(
          (b) => b.textContent?.trim() === label || b.getAttribute('aria-label') === label,
        );
      }

      const seatNames = (page: HTMLElement) =>
        [...section(page, 'Players').querySelectorAll('li .name')].map((n) => n.textContent);

      it('shows the seat order and whose turn it is', async () => {
        const { page } = await openDraft(complete, {
          state: 'Drafting',
          players: [bob, alicePlayer],
          turn: { pick: 1, round: 1, playerId: bob.id },
        });

        expect(seatNames(page)).toEqual(['Bob', 'Alice']);
        expect(page.textContent).toContain('Bob’s turn: pick 1, round 1');
        const current = section(page, 'Players').querySelector('li[aria-current="true"]');
        expect(current?.querySelector('.name')?.textContent).toBe('Bob');
      });

      it('tells the signed-in player when it is their turn', async () => {
        const { page } = await openDraft(complete, {
          state: 'Drafting',
          players: [alicePlayer, bob],
          turn: { pick: 1, round: 1, playerId: alice.id },
        });

        expect(page.textContent).toContain('Your turn: pick 1, round 1');
      });

      it('lets the organizer randomize the seats', async () => {
        const { fixture, page } = await openDraft(complete, { players: [alicePlayer, bob] });

        button(page, 'Randomize seats')!.click();
        const req = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/seats/randomize'));
        expect(req.request.method).toBe('POST');
        req.flush(draft({ players: [bob, alicePlayer] }));
        await fixture.whenStable();

        expect(seatNames(page)).toEqual(['Bob', 'Alice']);
      });

      it('lets the organizer move a player up or down the seat order', async () => {
        const { fixture, page } = await openDraft(complete, { players: [alicePlayer, bob] });
        expect(button(page, 'Move Alice up')?.disabled).toBe(true);
        expect(button(page, 'Move Bob down')?.disabled).toBe(true);

        button(page, 'Move Bob up')!.click();
        const req = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/seats'));
        expect(req.request.method).toBe('PUT');
        expect(req.request.body).toEqual({ userIds: [bob.id, alice.id] });
        req.flush(draft({ players: [bob, alicePlayer] }));
        await fixture.whenStable();

        expect(seatNames(page)).toEqual(['Bob', 'Alice']);
      });

      it('starts the draft for the organizer', async () => {
        const { fixture, page } = await openDraft(complete, { players: [alicePlayer, bob] });

        button(page, 'Start draft')!.click();
        const req = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/start'));
        expect(req.request.method).toBe('POST');
        req.flush(
          draft({
            state: 'Drafting',
            players: [alicePlayer, bob],
            turn: { pick: 1, round: 1, playerId: alice.id },
          }),
        );
        // A started draft has picks to show.
        await flushPicks([]);
        await fixture.whenStable();

        expect(page.textContent).toContain('Your turn: pick 1, round 1');
        expect(button(page, 'Start draft')).toBeUndefined();
        expect(button(page, 'Randomize seats')).toBeUndefined();
        expect(button(page, 'Move Bob up')).toBeUndefined();
      });

      it('says why a start was refused', async () => {
        const { fixture, page } = await openDraft(complete, { players: [alicePlayer, bob] });

        button(page, 'Start draft')!.click();
        const message = '2 players × 300 picks needs 600 cards, but the pool has 540.';
        (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/start'))).flush(
          { error: 'pool-too-small', message },
          { status: 409, statusText: 'Conflict' },
        );
        (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(
          draft({ players: [alicePlayer, bob] }),
        );
        await fixture.whenStable();

        expect(page.querySelector('[role="alert"]')?.textContent).toContain(message);
        expect(button(page, 'Start draft')).toBeDefined();
      });

      it('holds the start until the pool snapshot is complete', async () => {
        // Not openDraft: the snapshot's poll is due before the page settles.
        const { fixture, page } = await open('/drafts/draft-1');
        http.expectOne('/api/drafts/draft-1').flush(
          draft({
            snapshot: { state: 'Running', cards: 175, total: 540 },
            players: [alicePlayer, bob],
          }),
        );
        await flushQueue(EMPTY_QUEUE);
        TestBed.tick();

        expect(button(page, 'Start draft')?.disabled).toBe(true);
        expect(section(page, 'Players').textContent).toContain(
          'You can start the draft once the pool snapshot is complete.',
        );

        (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(
          draft({ players: [alicePlayer, bob] }),
        );
        await flushPool();
        await fixture.whenStable();
        expect(button(page, 'Start draft')?.disabled).toBe(false);
        expect(section(page, 'Players').textContent).not.toContain('You can start the draft once');
      });

      it('offers seat changes and the start only to the organizer or an app admin', async () => {
        const { page } = await openDraft(complete, {
          players: [alicePlayer, bob],
          organizer: { id: bob.id, name: bob.name },
        });

        expect(button(page, 'Start draft')).toBeUndefined();
        expect(button(page, 'Randomize seats')).toBeUndefined();
        expect(button(page, 'Move Bob up')).toBeUndefined();
      });
    });

    describe('undo', () => {
      const complete: PoolSnapshotView = { state: 'Complete', cards: 540, total: 540 };
      const picks: PickView[] = [
        { pick: 1, playerId: bob.id, oracleId: 'shock-oracle', name: 'Shock' },
        { pick: 2, playerId: alice.id, oracleId: 'bolt-oracle', name: 'Lightning Bolt' },
      ];
      const drafting = {
        state: 'Drafting' as const,
        players: [bob, alicePlayer],
        turn: { pick: 3, round: 2, playerId: alice.id },
      };

      const undoButton = (page: HTMLElement) =>
        [...page.querySelectorAll('button')].find((b) => b.textContent?.includes('Undo'));

      it('lets the organizer undo the latest pick, handing the turn back', async () => {
        const { fixture, page } = await openDraft(complete, drafting, { picks: picks });
        expect(undoButton(page)?.textContent?.trim()).toBe('Undo pick 2 (Lightning Bolt)');

        undoButton(page)!.click();
        const req = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/picks/2'));
        expect(req.request.method).toBe('DELETE');
        req.flush(
          draft({ ...drafting, turn: { pick: 2, round: 1, playerId: alice.id }, version: 1 }),
        );
        await flushPicks(picks.slice(0, 1));
        await flushQueue(EMPTY_QUEUE);
        await fixture.whenStable();

        expect(page.textContent).toContain('Your turn: pick 2, round 1');
        expect(undoButton(page)?.textContent?.trim()).toBe('Undo pick 1 (Shock)');
      });

      it('says why an undo was refused, and catches up with the draft', async () => {
        const { fixture, page } = await openDraft(complete, drafting, { picks: picks });

        undoButton(page)!.click();
        const message = 'Only the latest pick can be undone, and the picks have changed.';
        (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/picks/2'))).flush(
          { error: 'not-latest', message },
          { status: 409, statusText: 'Conflict' },
        );
        (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(
          draft({ ...drafting, turn: { pick: 4, round: 2, playerId: bob.id }, version: 1 }),
        );
        await flushPicks([
          ...picks,
          { pick: 3, playerId: alice.id, oracleId: 'spike-oracle', name: 'Lava Spike' },
        ]);
        await flushQueue(EMPTY_QUEUE);
        await fixture.whenStable();

        expect(page.querySelector('[role="alert"]')?.textContent).toContain(message);
        expect(undoButton(page)?.textContent?.trim()).toBe('Undo pick 3 (Lava Spike)');
      });

      it('offers undo only to the organizer or an app admin', async () => {
        const { page } = await openDraft(
          complete,
          { ...drafting, organizer: { id: bob.id, name: bob.name } },
          { picks: picks },
        );

        expect(undoButton(page)).toBeUndefined();
      });

      it('offers no undo before the first pick', async () => {
        const { page } = await openDraft(complete, {
          ...drafting,
          turn: { pick: 1, round: 1, playerId: bob.id },
        });

        expect(undoButton(page)).toBeUndefined();
      });

      it('offers no undo once the draft is complete', async () => {
        const { page } = await openDraft(
          complete,
          { ...drafting, state: 'Complete', turn: null },
          { picks: picks },
        );

        expect(undoButton(page)).toBeUndefined();
      });
    });

    describe('pause and resume', () => {
      const complete: PoolSnapshotView = { state: 'Complete', cards: 540, total: 540 };
      const drafting = {
        state: 'Drafting' as const,
        players: [alicePlayer, bob],
        turn: { pick: 1, round: 1, playerId: alice.id },
      };
      const paused = { ...drafting, state: 'Paused' as const };

      const button = (page: HTMLElement, label: string) =>
        [...page.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);

      it('lets the organizer pause the draft, telling everyone picks have stopped', async () => {
        const { fixture, page } = await openDraft(complete, drafting);
        expect(button(page, 'Resume draft')).toBeUndefined();

        button(page, 'Pause draft')!.click();
        const req = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/pause'));
        expect(req.request.method).toBe('POST');
        req.flush(draft({ ...paused, version: 1 }));
        await flushPicks([]);
        await flushQueue(EMPTY_QUEUE);
        await fixture.whenStable();

        expect(page.textContent).toContain('The draft is paused. No picks until it resumes.');
        expect(button(page, 'Pause draft')).toBeUndefined();
        expect(button(page, 'Resume draft')).toBeDefined();
      });

      it('lets the organizer resume a paused draft', async () => {
        const { fixture, page } = await openDraft(complete, paused);

        button(page, 'Resume draft')!.click();
        const req = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/resume'));
        expect(req.request.method).toBe('POST');
        req.flush(draft({ ...drafting, version: 1 }));
        await flushPicks([]);
        await flushQueue(EMPTY_QUEUE);
        await fixture.whenStable();

        expect(page.textContent).not.toContain('The draft is paused');
        expect(button(page, 'Pause draft')).toBeDefined();
      });

      it('says why a pause was refused, and catches up with the draft', async () => {
        const { fixture, page } = await openDraft(complete, drafting);

        button(page, 'Pause draft')!.click();
        const message = 'Only a drafting draft can be paused.';
        (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/pause'))).flush(
          { error: 'not-drafting', message },
          { status: 409, statusText: 'Conflict' },
        );
        (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(
          draft({ ...paused, version: 1 }),
        );
        await flushPicks([]);
        await flushQueue(EMPTY_QUEUE);
        await fixture.whenStable();

        expect(page.querySelector('[role="alert"]')?.textContent).toContain(message);
        expect(button(page, 'Resume draft')).toBeDefined();
      });

      it('offers pause and resume only to the organizer or an app admin', async () => {
        const { page } = await openDraft(complete, {
          ...paused,
          organizer: { id: bob.id, name: bob.name },
        });

        expect(button(page, 'Resume draft')).toBeUndefined();
        expect(page.textContent).toContain('The draft is paused. No picks until it resumes.');
      });

      it('shows every viewer the draft pausing as it happens', async () => {
        const { fixture, page } = await openDraft(complete, {
          ...drafting,
          organizer: { id: bob.id, name: bob.name },
        });

        updates.events.next({
          type: 'changed',
          draft: draft({ ...paused, organizer: { id: bob.id, name: bob.name }, version: 1 }),
        });
        await flushPicks([]);
        await flushQueue(EMPTY_QUEUE);
        await fixture.whenStable();

        expect(page.textContent).toContain('The draft is paused. No picks until it resumes.');
      });
    });

    describe('pool tab', () => {
      const complete: PoolSnapshotView = { state: 'Complete', cards: 2, total: 2 };

      // jsdom lays nothing out, so the window is 0px tall and the grid, which
      // only renders the rows on screen, would render just a few. Give it a
      // phone-sized screen instead.
      beforeEach(() => {
        Object.defineProperty(document.documentElement, 'clientHeight', {
          configurable: true,
          value: 800,
        });
      });
      afterEach(() => {
        delete (document.documentElement as { clientHeight?: number }).clientHeight;
      });

      /** Scryfall's image URL for one face of a printing. */
      const image = (version: string, id: string, face = 'front') =>
        `https://cards.scryfall.io/${version}/${face}/${id}.jpg`;
      const card = (fields: Partial<PoolCardView>): PoolCardView => ({
        scryfallId: 'shivan-id',
        oracleId: 'shivan-oracle',
        name: 'Shivan Dragon',
        set: 'm20',
        collectorNumber: '332',
        typeLine: 'Creature — Dragon',
        colors: ['R'],
        manaValue: 6,
        manaCost: '{4}{R}{R}',
        oracleText: 'Flying\n{R}: Shivan Dragon gets +1/+0 until end of turn.',
        colorIdentity: ['R'],
        keywords: ['Flying'],
        rarity: 'rare',
        layout: 'normal',
        power: '5',
        toughness: '5',
        loyalty: null,
        defense: null,
        faces: [],
        images: [
          {
            small: image('small', 'shivan-id'),
            normal: image('normal', 'shivan-id'),
            large: image('large', 'shivan-id'),
          },
        ],
        ...fields,
      });
      const shivan = card({});
      const brightclimb = card({
        scryfallId: 'brightclimb-id',
        oracleId: 'brightclimb-oracle',
        name: 'Brightclimb Pathway // Grimclimb Pathway',
        typeLine: 'Land // Land',
        layout: 'modal_dfc',
        colors: [],
        manaValue: 0,
        images: (['front', 'back'] as const).map((face) => ({
          small: image('small', 'brightclimb-id', face),
          normal: image('normal', 'brightclimb-id', face),
          large: image('large', 'brightclimb-id', face),
        })),
      });

      /** The grid's tiles, one per pool card. */
      const tiles = (page: HTMLElement) => [
        ...page.querySelectorAll<HTMLButtonElement>('[role="tabpanel"] .grid button'),
      ];

      it('has a bottom tab bar where Pool and Board work, and Me for players', async () => {
        const { page } = await openDraft(complete);

        const tabs = [...page.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
        expect(tabs.map((tab) => tab.textContent?.trim())).toEqual([
          'Pool',
          'Queue',
          'Board',
          'Me',
        ]);
        expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual([
          'true',
          'false',
          'false',
          'false',
        ]);
        expect(tabs.map((tab) => tab.disabled)).toEqual([false, true, false, true]);
        expect(page.querySelector('[role="tabpanel"]')?.textContent).toContain(
          '2 cards in the pool',
        );
      });

      it('shows the pool as a grid of lazily loaded normal images with name placeholders', async () => {
        const { page } = await openDraft(complete, {}, { cards: [brightclimb, shivan] });

        expect(tiles(page).map((tile) => tile.querySelector('.placeholder')?.textContent)).toEqual([
          'Brightclimb Pathway // Grimclimb Pathway',
          'Shivan Dragon',
        ]);
        const images = tiles(page).map((tile) => tile.querySelector('img')!);
        expect(images.map((img) => img.getAttribute('src'))).toEqual([
          image('normal', 'brightclimb-id'),
          image('normal', 'shivan-id'),
        ]);
        expect(images.map((img) => img.getAttribute('loading'))).toEqual(['lazy', 'lazy']);
        expect(images[1].getAttribute('alt')).toBe('Shivan Dragon');
      });

      it('falls back to Scryfall’s API image when a grid image fails to load', async () => {
        const { fixture, page } = await openDraft(complete, {}, { cards: [shivan] });

        const img = tiles(page)[0].querySelector('img')!;
        img.dispatchEvent(new Event('error'));
        await fixture.whenStable();

        expect(img.getAttribute('src')).toBe(
          'https://api.scryfall.com/cards/shivan-id?format=image&version=normal',
        );
      });

      /** Taps the grid's `index`th card and returns the detail view it opens. */
      async function openDetail(
        fixture: { whenStable(): Promise<unknown> },
        page: HTMLElement,
        index: number,
      ) {
        tiles(page)[index].click();
        await fixture.whenStable();
        return page.querySelector<HTMLElement>('[role="dialog"]')!;
      }

      const buttonIn = (root: HTMLElement, label: string) =>
        [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);

      it('opens a card’s large image when it is tapped, and closes it again', async () => {
        const { fixture, page } = await openDraft(complete, {}, { cards: [brightclimb, shivan] });

        const detail = await openDetail(fixture, page, 1);
        expect(detail.getAttribute('aria-label')).toBe('Shivan Dragon');
        expect(detail.querySelector('img')?.getAttribute('src')).toBe(image('large', 'shivan-id'));
        expect(buttonIn(detail, 'Flip')).toBeUndefined();

        buttonIn(detail, 'Close')!.click();
        await fixture.whenStable();
        expect(page.querySelector('[role="dialog"]')).toBeNull();
      });

      it('flips a double-faced card between its faces', async () => {
        const { fixture, page } = await openDraft(complete, {}, { cards: [brightclimb, shivan] });

        const detail = await openDetail(fixture, page, 0);
        const img = () => detail.querySelector('img')?.getAttribute('src');
        expect(img()).toBe(image('large', 'brightclimb-id', 'front'));

        buttonIn(detail, 'Flip')!.click();
        await fixture.whenStable();
        expect(img()).toBe(image('large', 'brightclimb-id', 'back'));

        buttonIn(detail, 'Flip')!.click();
        await fixture.whenStable();
        expect(img()).toBe(image('large', 'brightclimb-id', 'front'));
      });

      describe('search and hide picked', () => {
        const names = (page: HTMLElement) =>
          tiles(page).map((tile) => tile.querySelector('.placeholder')?.textContent);

        /** Types `text` into the Pool tab's search box, as a keystroke would. */
        async function search(
          fixture: { whenStable(): Promise<unknown> },
          page: HTMLElement,
          text: string,
        ) {
          const box = page.querySelector<HTMLInputElement>('input[type="search"]')!;
          box.value = text;
          box.dispatchEvent(new Event('input'));
          await fixture.whenStable();
        }

        it('narrows the grid to the cards matching the search as you type', async () => {
          const { fixture, page } = await openDraft(complete, {}, { cards: [brightclimb, shivan] });

          await search(fixture, page, 't:dragon');
          expect(names(page)).toEqual(['Shivan Dragon']);

          await search(fixture, page, 't:land');
          expect(names(page)).toEqual(['Brightclimb Pathway // Grimclimb Pathway']);
        });

        it('says why a search is bad, and keeps the grid as it was until it is fixed', async () => {
          const { fixture, page } = await openDraft(complete, {}, { cards: [brightclimb, shivan] });
          const note = () => page.querySelector('[role="tabpanel"] .search-error')?.textContent;

          await search(fixture, page, 't:dragon');
          await search(fixture, page, 't:dragon (');
          expect(note()).toContain('The search ends too soon.');
          expect(names(page)).toEqual(['Shivan Dragon']);

          await search(fixture, page, 't:dragon usd<1');
          expect(note()).toContain('usd< isn’t supported here.');
          expect(names(page)).toEqual(['Shivan Dragon']);

          await search(fixture, page, 't:land');
          expect(note()).toBe('');
          expect(names(page)).toEqual(['Brightclimb Pathway // Grimclimb Pathway']);
        });

        it('shows the whole pool when the search is emptied', async () => {
          const { fixture, page } = await openDraft(complete, {}, { cards: [brightclimb, shivan] });

          await search(fixture, page, 't:dragon');
          await search(fixture, page, '  ');

          expect(names(page)).toEqual([
            'Brightclimb Pathway // Grimclimb Pathway',
            'Shivan Dragon',
          ]);
        });

        it('hides picked cards when asked, together with the search', async () => {
          const thundermaw = card({
            scryfallId: 'thundermaw-id',
            oracleId: 'thundermaw-oracle',
            name: 'Thundermaw Hellkite',
          });
          const { fixture, page } = await openDraft(
            complete,
            { state: 'Drafting', players: [bob], turn: { pick: 2, round: 1, playerId: bob.id } },
            {
              cards: [brightclimb, shivan, thundermaw],
              picks: [
                { pick: 1, playerId: bob.id, oracleId: 'shivan-oracle', name: 'Shivan Dragon' },
              ],
            },
          );
          const hidePicked = page.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
          expect(hidePicked.closest('label')?.textContent).toContain('Hide picked');

          await search(fixture, page, 't:dragon');
          expect(names(page)).toEqual(['Shivan Dragon', 'Thundermaw Hellkite']);
          expect(tiles(page)[0].textContent).toContain('Picked');

          hidePicked.click();
          await fixture.whenStable();
          expect(names(page)).toEqual(['Thundermaw Hellkite']);

          await search(fixture, page, '');
          expect(names(page)).toEqual([
            'Brightclimb Pathway // Grimclimb Pathway',
            'Thundermaw Hellkite',
          ]);

          hidePicked.click();
          await fixture.whenStable();
          expect(names(page)).toHaveLength(3);
        });
      });

      describe('picking', () => {
        /** Started, with Alice then Bob; Alice is up unless told otherwise. */
        const drafting = (fields: Partial<DraftView> = {}): Partial<DraftView> => ({
          state: 'Drafting',
          players: [alicePlayer, bob],
          turn: { pick: 1, round: 1, playerId: alice.id },
          ...fields,
        });
        const shivanPick: PickView = {
          pick: 1,
          playerId: alice.id,
          oracleId: 'shivan-oracle',
          name: 'Shivan Dragon',
        };

        it('lets the player whose turn it is pick a card from its detail', async () => {
          const { fixture, page } = await openDraft(complete, drafting(), {
            cards: [brightclimb, shivan],
          });

          const detail = await openDetail(fixture, page, 1);
          buttonIn(detail, 'Pick')!.click();
          const req = http.expectOne('/api/drafts/draft-1/picks');
          expect(req.request.method).toBe('POST');
          expect(req.request.body).toEqual({ oracleId: 'shivan-oracle' });
          req.flush(draft(drafting({ turn: { pick: 2, round: 1, playerId: bob.id } })));
          await flushPicks([shivanPick]);
          await fixture.whenStable();

          expect(page.querySelector('[role="dialog"]')).toBeNull();
          expect(page.textContent).toContain('Bob’s turn: pick 2, round 1');
          expect(tiles(page)[1].classList).toContain('picked');
          expect(tiles(page)[1].textContent).toContain('Picked');
          expect(tiles(page)[0].classList).not.toContain('picked');
        });

        it('disables Pick when it is not your turn', async () => {
          const { fixture, page } = await openDraft(
            complete,
            drafting({ turn: { pick: 1, round: 1, playerId: bob.id } }),
            { cards: [shivan] },
          );

          const detail = await openDetail(fixture, page, 0);

          expect(buttonIn(detail, 'Pick')!.disabled).toBe(true);
          expect(detail.textContent).toContain('You can pick on your turn.');
        });

        it('disables Pick for a card that has been picked', async () => {
          const { fixture, page } = await openDraft(
            complete,
            drafting({ turn: { pick: 2, round: 1, playerId: alice.id } }),
            { cards: [brightclimb, shivan], picks: [{ ...shivanPick, playerId: bob.id }] },
          );

          expect(tiles(page)[1].textContent).toContain('Picked');
          const detail = await openDetail(fixture, page, 1);
          expect(buttonIn(detail, 'Pick')!.disabled).toBe(true);
          expect(detail.textContent).toContain('Already picked.');
        });

        it('offers no Pick to someone who is not a player', async () => {
          const { fixture, page } = await openDraft(complete, drafting({ players: [bob] }), {
            cards: [shivan],
          });

          expect(buttonIn(await openDetail(fixture, page, 0), 'Pick')).toBeUndefined();
        });

        it('offers no Pick before the draft starts', async () => {
          const { fixture, page } = await openDraft(
            complete,
            { players: [alicePlayer, bob] },
            { cards: [shivan] },
          );

          expect(buttonIn(await openDetail(fixture, page, 0), 'Pick')).toBeUndefined();
        });

        it('says why a pick was refused, and catches up with the draft', async () => {
          const { fixture, page } = await openDraft(complete, drafting(), { cards: [shivan] });

          const detail = await openDetail(fixture, page, 0);
          buttonIn(detail, 'Pick')!.click();
          http
            .expectOne('/api/drafts/draft-1/picks')
            .flush(
              { error: 'not-your-turn', message: 'It’s not your turn.' },
              { status: 409, statusText: 'Conflict' },
            );
          // The page re-reads the draft and its picks to catch up.
          (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(
            draft(drafting({ turn: { pick: 2, round: 1, playerId: bob.id } })),
          );
          await flushPicks([{ ...shivanPick, oracleId: 'other-oracle', name: 'Other' }]);
          await fixture.whenStable();

          expect(detail.querySelector('[role="alert"]')?.textContent).toContain(
            'It’s not your turn.',
          );
          expect(page.textContent).toContain('Bob’s turn: pick 2, round 1');
        });
      });

      describe('queue', () => {
        /** Started, with Alice then Bob; Bob is up. */
        const drafting = (fields: Partial<DraftView> = {}): Partial<DraftView> => ({
          state: 'Drafting',
          players: [alicePlayer, bob],
          turn: { pick: 1, round: 1, playerId: bob.id },
          ...fields,
        });
        const queued = (card: PoolCardView) => ({ oracleId: card.oracleId, name: card.name });

        /** Opens the Queue tab and returns its panel. */
        async function openQueue(fixture: { whenStable(): Promise<unknown> }, page: HTMLElement) {
          tabButton(page, 'Queue').click();
          await fixture.whenStable();
          return panel(page);
        }

        it('adds a card to your queue from its detail, and lists it on the Queue tab', async () => {
          const { fixture, page } = await openDraft(complete, drafting(), {
            cards: [brightclimb, shivan],
          });

          const detail = await openDetail(fixture, page, 1);
          buttonIn(detail, 'Add to queue')!.click();
          const req = http.expectOne('/api/drafts/draft-1/queue');
          expect(req.request.method).toBe('POST');
          expect(req.request.body).toEqual({ oracleId: 'shivan-oracle' });
          req.flush({ cards: [queued(shivan)], lost: [] });
          await fixture.whenStable();
          expect(detail.textContent).toContain('Added to your queue.');
          expect(buttonIn(detail, 'Add to queue')).toBeUndefined();
          expect(buttonIn(detail, 'Remove from queue')).toBeDefined();

          const queue = await openQueue(fixture, page);
          expect(queue.querySelector('h2')?.textContent).toContain('Queue');
          expect([...queue.querySelectorAll('li .name')].map((li) => li.textContent)).toEqual([
            'Shivan Dragon',
          ]);
        });

        it('offers to remove a queued card from its detail', async () => {
          const { fixture, page } = await openDraft(complete, drafting(), {
            cards: [brightclimb, shivan],
            queue: {
              cards: [queued(shivan)],
              lost: [],
            },
          });

          expect(buttonIn(await openDetail(fixture, page, 1), 'Remove from queue')).toBeDefined();
          buttonIn(page.querySelector('[role="dialog"]')!, 'Close')!.click();
          await fixture.whenStable();
          const detail = await openDetail(fixture, page, 0);
          expect(buttonIn(detail, 'Add to queue')).toBeDefined();
          expect(buttonIn(detail, 'Remove from queue')).toBeUndefined();
        });

        /** The names in the Queue tab's list, in order. */
        const names = (queue: HTMLElement) =>
          [...queue.querySelectorAll('li .name')].map((name) => name.textContent);

        it('removes a queued card from its detail, then offers to add it again', async () => {
          const { fixture, page } = await openDraft(complete, drafting(), {
            cards: [brightclimb, shivan],
            queue: { cards: [queued(shivan), queued(brightclimb)], lost: [] },
          });

          const detail = await openDetail(fixture, page, 1);
          buttonIn(detail, 'Remove from queue')!.click();
          const req = http.expectOne('/api/drafts/draft-1/queue/shivan-oracle');
          expect(req.request.method).toBe('DELETE');
          req.flush({ cards: [queued(brightclimb)], lost: [] });
          await fixture.whenStable();

          expect(detail.querySelector('[role="status"]')?.textContent).toContain(
            'Removed from your queue.',
          );
          expect(buttonIn(detail, 'Remove from queue')).toBeUndefined();
          expect(buttonIn(detail, 'Add to queue')).toBeDefined();
          expect(names(await openQueue(fixture, page))).toEqual([
            'Brightclimb Pathway // Grimclimb Pathway',
          ]);
        });

        it('says when a card could not be removed from your queue, and re-reads it', async () => {
          const { fixture, page } = await openDraft(complete, drafting(), {
            cards: [shivan],
            queue: {
              cards: [queued(shivan)],
              lost: [],
            },
          });

          const detail = await openDetail(fixture, page, 0);
          buttonIn(detail, 'Remove from queue')!.click();
          http
            .expectOne('/api/drafts/draft-1/queue/shivan-oracle')
            .flush(null, { status: 500, statusText: 'Server Error' });
          // The queue is re-read, as it may have moved on.
          await flushQueue({ cards: [queued(shivan)], lost: [] });
          await fixture.whenStable();

          expect(detail.querySelector('[role="status"]')?.textContent).toContain(
            "Couldn't remove the card from your queue.",
          );
          expect(buttonIn(detail, 'Remove from queue')).toBeDefined();
        });

        it('offers only a disabled Add to queue for a picked card, even one still queued', async () => {
          // Picked since the queue was read: it isn't lost from it yet.
          const { fixture, page } = await openDraft(
            complete,
            drafting({ turn: { pick: 2, round: 1, playerId: alice.id } }),
            {
              cards: [shivan],
              picks: [
                { pick: 1, playerId: bob.id, oracleId: 'shivan-oracle', name: 'Shivan Dragon' },
              ],
              queue: { cards: [queued(shivan)], lost: [] },
            },
          );

          const detail = await openDetail(fixture, page, 0);
          expect(buttonIn(detail, 'Add to queue')!.disabled).toBe(true);
          expect(buttonIn(detail, 'Remove from queue')).toBeUndefined();
        });

        it('offers only a disabled Add to queue for a card lost from the queue', async () => {
          const { fixture, page } = await openDraft(
            complete,
            drafting({ turn: { pick: 2, round: 1, playerId: alice.id } }),
            {
              cards: [shivan],
              picks: [
                { pick: 1, playerId: bob.id, oracleId: 'shivan-oracle', name: 'Shivan Dragon' },
              ],
              queue: { cards: [], lost: [queued(shivan)] },
            },
          );

          const detail = await openDetail(fixture, page, 0);
          expect(buttonIn(detail, 'Add to queue')!.disabled).toBe(true);
          expect(buttonIn(detail, 'Remove from queue')).toBeUndefined();
        });

        it('says on the Pool tab when your queue could not be loaded', async () => {
          const { fixture, page } = await open('/drafts/draft-1');
          http.expectOne('/api/drafts/draft-1').flush(draft(drafting()));
          await flushPool([shivan]);
          await flushPicks([]);
          (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/queue'))).flush(null, {
            status: 500,
            statusText: 'Server Error',
          });
          await fixture.whenStable();

          expect(panel(page).querySelector('.error')?.textContent).toContain(
            "Couldn't load your queue.",
          );
        });

        it('offers to add a card again once it is removed on the Queue tab', async () => {
          const { fixture, page } = await openDraft(complete, drafting(), {
            cards: [shivan],
            queue: {
              cards: [queued(shivan)],
              lost: [],
            },
          });

          const queue = await openQueue(fixture, page);
          queue.querySelector<HTMLButtonElement>('[aria-label="Remove Shivan Dragon"]')!.click();
          http.expectOne('/api/drafts/draft-1/queue/shivan-oracle').flush(EMPTY_QUEUE);
          await fixture.whenStable();
          tabButton(page, 'Pool').click();
          await fixture.whenStable();

          const detail = await openDetail(fixture, page, 0);
          expect(buttonIn(detail, 'Add to queue')).toBeDefined();
          expect(buttonIn(detail, 'Remove from queue')).toBeUndefined();
        });

        it('removes a card from the Queue tab', async () => {
          const { fixture, page } = await openDraft(complete, drafting(), {
            cards: [brightclimb, shivan],
            queue: {
              cards: [queued(shivan), queued(brightclimb)],
              lost: [],
            },
          });
          const queue = await openQueue(fixture, page);

          queue.querySelector<HTMLButtonElement>('[aria-label="Remove Shivan Dragon"]')!.click();
          const req = http.expectOne('/api/drafts/draft-1/queue/shivan-oracle');
          expect(req.request.method).toBe('DELETE');
          req.flush({ cards: [queued(brightclimb)], lost: [] });
          await fixture.whenStable();

          expect(names(queue)).toEqual(['Brightclimb Pathway // Grimclimb Pathway']);
        });

        it('moves a card up or down the queue, saving the new order', async () => {
          const { fixture, page } = await openDraft(complete, drafting(), {
            cards: [brightclimb, shivan],
            queue: {
              cards: [queued(shivan), queued(brightclimb)],
              lost: [],
            },
          });
          const queue = await openQueue(fixture, page);
          expect(
            queue.querySelector<HTMLButtonElement>('[aria-label="Move Shivan Dragon up"]')!
              .disabled,
          ).toBe(true);

          queue.querySelector<HTMLButtonElement>('[aria-label="Move Shivan Dragon down"]')!.click();
          await fixture.whenStable();
          // Shown at once, before the API answers.
          expect(names(queue)).toEqual([
            'Brightclimb Pathway // Grimclimb Pathway',
            'Shivan Dragon',
          ]);
          const req = http.expectOne('/api/drafts/draft-1/queue');
          expect(req.request.method).toBe('PUT');
          expect(req.request.body).toEqual({ oracleIds: ['brightclimb-oracle', 'shivan-oracle'] });
          req.flush({ cards: [queued(brightclimb), queued(shivan)], lost: [] });
          await fixture.whenStable();

          expect(names(queue)).toEqual([
            'Brightclimb Pathway // Grimclimb Pathway',
            'Shivan Dragon',
          ]);
        });

        it('notes cards lost to other players, until dismissed', async () => {
          const { fixture, page } = await openDraft(complete, drafting(), {
            cards: [brightclimb, shivan],
            queue: {
              cards: [queued(brightclimb)],
              lost: [queued(shivan)],
            },
          });
          const queue = await openQueue(fixture, page);

          const note = queue.querySelector<HTMLElement>('.lost')!;
          expect(note.textContent).toContain('Lost to other players');
          expect(note.textContent).toContain('Shivan Dragon');
          expect(names(queue)).toEqual(['Brightclimb Pathway // Grimclimb Pathway']);

          buttonIn(note, 'Dismiss')!.click();
          const req = http.expectOne('/api/drafts/draft-1/queue/lost');
          expect(req.request.method).toBe('DELETE');
          req.flush({ cards: [queued(brightclimb)], lost: [] });
          await fixture.whenStable();

          expect(queue.querySelector('.lost')).toBeNull();
        });

        it('re-reads the queue when the draft changes, so a lost card shows', async () => {
          const { fixture, page } = await openDraft(complete, drafting(), {
            cards: [brightclimb, shivan],
            queue: { cards: [queued(shivan)], lost: [] },
          });
          const queue = await openQueue(fixture, page);

          updates.events.next({
            type: 'changed',
            draft: draft(drafting({ turn: { pick: 2, round: 1, playerId: bob.id }, version: 1 })),
          });
          await flushPicks([]);
          (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/queue'))).flush({
            cards: [],
            lost: [queued(shivan)],
          });
          await fixture.whenStable();

          expect(queue.querySelector('.lost')?.textContent).toContain('Shivan Dragon');
        });

        it('offers Add to queue and the Queue tab only to players', async () => {
          const { fixture, page } = await openDraft(complete, drafting({ players: [bob] }), {
            cards: [shivan],
          });

          expect(buttonIn(await openDetail(fixture, page, 0), 'Add to queue')).toBeUndefined();
          expect(tabButton(page, 'Queue').disabled).toBe(true);
        });

        it('offers no Add to queue once the draft is complete', async () => {
          const { fixture, page } = await openDraft(
            complete,
            drafting({ state: 'Complete', turn: null }),
            { cards: [shivan] },
          );

          expect(buttonIn(await openDetail(fixture, page, 0), 'Add to queue')).toBeUndefined();
        });

        it('says why a new order was refused, and re-reads the queue', async () => {
          const { fixture, page } = await openDraft(complete, drafting(), {
            cards: [brightclimb, shivan],
            queue: {
              cards: [queued(shivan), queued(brightclimb)],
              lost: [],
            },
          });
          const queue = await openQueue(fixture, page);

          queue.querySelector<HTMLButtonElement>('[aria-label="Move Shivan Dragon down"]')!.click();
          http
            .expectOne('/api/drafts/draft-1/queue')
            .flush(
              { error: 'queue-changed', message: 'Your queue has changed. Reload and try again.' },
              { status: 409, statusText: 'Conflict' },
            );
          (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/queue'))).flush({
            cards: [queued(shivan)],
            lost: [],
          });
          await fixture.whenStable();

          expect(queue.querySelector('[role="alert"]')?.textContent).toContain(
            'Your queue has changed.',
          );
          expect(names(queue)).toEqual(['Shivan Dragon']);
        });
      });

      it('falls back to Scryfall’s API image of the face shown when a detail image fails to load', async () => {
        const { fixture, page } = await openDraft(complete, {}, { cards: [brightclimb] });

        const detail = await openDetail(fixture, page, 0);
        buttonIn(detail, 'Flip')!.click();
        await fixture.whenStable();
        detail.querySelector('img')!.dispatchEvent(new Event('error'));
        await fixture.whenStable();

        expect(detail.querySelector('img')?.getAttribute('src')).toBe(
          'https://api.scryfall.com/cards/brightclimb-id?format=image&version=large&face=back',
        );
      });
    });

    describe('board tab', () => {
      const complete: PoolSnapshotView = { state: 'Complete', cards: 540, total: 540 };
      const picks: PickView[] = [
        { pick: 1, playerId: bob.id, oracleId: 'shock-oracle', name: 'Shock' },
        { pick: 2, playerId: alice.id, oracleId: 'bolt-oracle', name: 'Lightning Bolt' },
        { pick: 3, playerId: alice.id, oracleId: 'spike-oracle', name: 'Lava Spike' },
      ];

      async function openBoard(picks: PickView[]) {
        const opened = await openDraft(
          complete,
          {
            state: 'Drafting',
            players: [bob, alicePlayer],
            turn: { pick: 4, round: 2, playerId: bob.id },
          },
          { picks: picks },
        );
        tabButton(opened.page, 'Board').click();
        await opened.fixture.whenStable();
        return opened;
      }

      const pickLog = (root: HTMLElement) => panel(root).querySelector<HTMLElement>('.log')!;

      it('switches between the Pool and Board tabs', async () => {
        const { fixture, page } = await openBoard(picks);

        expect(tabButton(page, 'Board').getAttribute('aria-selected')).toBe('true');
        expect(tabButton(page, 'Pool').getAttribute('aria-selected')).toBe('false');
        expect(panel(page).querySelector('h2')?.textContent).toBe('Board');

        tabButton(page, 'Pool').click();
        await fixture.whenStable();
        expect(panel(page).querySelector('h2')?.textContent).toBe('Pool');
      });

      it('shows the pick log: pick number, player and card', async () => {
        const { page } = await openBoard(picks);

        const log = [...pickLog(page).querySelectorAll('li')].map((li) =>
          [...li.querySelectorAll('span')].map((span) => span.textContent?.trim()),
        );
        expect(log).toEqual([
          ['1', 'Bob', 'Shock'],
          ['2', 'Alice', 'Lightning Bolt'],
          ['3', 'Alice', 'Lava Spike'],
        ]);
      });

      it('lists every player’s picks, in seat order', async () => {
        const { page } = await openBoard(picks);

        const players = [...panel(page).querySelectorAll('.player-picks section')].map(
          (player) => ({
            name: player.querySelector('h3')?.textContent?.trim(),
            picks: [...player.querySelectorAll('li')].map((li) => li.textContent?.trim()),
          }),
        );
        expect(players).toEqual([
          { name: 'Bob', picks: ['Shock'] },
          { name: 'Alice', picks: ['Lightning Bolt', 'Lava Spike'] },
        ]);
      });

      it('says when nobody has picked yet', async () => {
        const { page } = await openBoard([]);

        expect(pickLog(page).textContent).toContain('No picks yet.');
      });

      describe('a player’s picks', () => {
        /** The open panel's heading and its picks: pick number and card. */
        const shownPlayer = (root: HTMLElement) => ({
          heading: panel(root).querySelector('h2')?.textContent,
          picks: [...panel(root).querySelectorAll('li')].map((li) =>
            [...li.querySelectorAll('span')].map((span) => span.textContent?.trim()),
          ),
        });

        it('lists your picks on the Me tab', async () => {
          const { fixture, page } = await openBoard(picks);

          tabButton(page, 'Me').click();
          await fixture.whenStable();

          expect(tabButton(page, 'Me').getAttribute('aria-selected')).toBe('true');
          expect(shownPlayer(page)).toEqual({
            heading: 'Your picks',
            picks: [
              ['2', 'Lightning Bolt'],
              ['3', 'Lava Spike'],
            ],
          });
        });

        it('opens any player’s picks from the Board, and goes back', async () => {
          const { fixture, page } = await openBoard(picks);
          const bobsColumn = panel(page).querySelector('.player-picks section')!;

          bobsColumn.querySelector<HTMLButtonElement>('h3 button')!.click();
          await fixture.whenStable();

          expect(shownPlayer(page)).toEqual({ heading: 'Bob’s picks', picks: [['1', 'Shock']] });
          expect(tabButton(page, 'Board').getAttribute('aria-selected')).toBe('true');
          expect(tabButton(page, 'Me').getAttribute('aria-selected')).toBe('false');
          [...panel(page).querySelectorAll('button')]
            .find((button) => button.textContent?.includes('Board'))!
            .click();
          await fixture.whenStable();
          expect(panel(page).querySelector('h2')?.textContent).toBe('Board');
        });

        it('still shows a complete draft’s picks, with no turn', async () => {
          const { fixture, page } = await openDraft(
            complete,
            { state: 'Complete', players: [bob, alicePlayer], turn: null },
            { picks: picks },
          );

          expect(page.querySelector('.state')?.textContent).toBe('Complete');
          expect(page.querySelector('.turn')).toBeNull();
          tabButton(page, 'Me').click();
          await fixture.whenStable();
          expect(shownPlayer(page).picks).toEqual([
            ['2', 'Lightning Bolt'],
            ['3', 'Lava Spike'],
          ]);
        });

        it('offers the Me tab only to players', async () => {
          const { page } = await openDraft(complete, {
            state: 'Drafting',
            players: [bob],
            turn: { pick: 1, round: 1, playerId: bob.id },
          });

          expect(tabButton(page, 'Me').disabled).toBe(true);
        });
      });
    });

    describe('bots', () => {
      const complete: PoolSnapshotView = { state: 'Complete', cards: 540, total: 540 };
      const bot = {
        id: 'bot:1',
        name: 'Bot 1',
        avatarUrl: 'https://cdn.discordapp.com/embed/avatars/0.png',
        isBot: true,
      };
      const admin = { ...alice, isAdmin: true };

      function button(page: HTMLElement, label: string) {
        return [...page.querySelectorAll<HTMLButtonElement>('button')].find(
          (b) => b.textContent?.trim() === label || b.getAttribute('aria-label') === label,
        );
      }

      /** The text of each badge in `root`. */
      const badges = (root: Element | null) =>
        [...(root?.querySelectorAll('.badge') ?? [])].map((badge) => badge.textContent?.trim());

      it('marks bots with a badge in the players, turn, board and pick log', async () => {
        const { fixture, page } = await openDraft(
          complete,
          {
            state: 'Drafting',
            players: [bot, alicePlayer],
            turn: { pick: 3, round: 2, playerId: bot.id },
          },
          {
            picks: [
              { pick: 1, playerId: bot.id, oracleId: 'shock-oracle', name: 'Shock' },
              { pick: 2, playerId: alice.id, oracleId: 'bolt-oracle', name: 'Lightning Bolt' },
            ],
          },
        );

        const seats = section(page, 'Players').querySelectorAll('li');
        expect(badges(seats[0])).toEqual(['Bot']);
        expect(badges(seats[1])).toEqual([]);
        expect(page.querySelector('.turn')?.textContent).toContain('Bot 1’s turn');
        expect(badges(page.querySelector('.turn'))).toEqual(['Bot']);

        tabButton(page, 'Board').click();
        await fixture.whenStable();
        const columns = panel(page).querySelectorAll('.player-picks h3');
        expect(badges(columns[0])).toEqual(['Bot']);
        expect(badges(columns[1])).toEqual([]);
        const log = panel(page).querySelectorAll('.log li');
        expect(log[0].textContent).toContain('Bot 1');
        expect(badges(log[0])).toEqual(['Bot']);
        expect(badges(log[1])).toEqual([]);
      });

      it('lets an app admin add a bot, then remove it', async () => {
        const { fixture, page } = await openDraft(
          complete,
          { players: [alicePlayer] },
          { user: admin },
        );

        button(page, 'Add bot')!.click();
        const added = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/bots'));
        expect(added.request.method).toBe('POST');
        added.flush(draft({ players: [alicePlayer, bot] }), { status: 201, statusText: 'Created' });
        await fixture.whenStable();
        expect(section(page, 'Players').textContent).toContain('Bot 1');
        expect(button(page, 'Remove Alice')).toBeUndefined();

        button(page, 'Remove Bot 1')!.click();
        const removed = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/bots/bot%3A1'));
        expect(removed.request.method).toBe('DELETE');
        removed.flush(draft({ players: [alicePlayer] }));
        await fixture.whenStable();
        expect(section(page, 'Players').textContent).not.toContain('Bot 1');
      });

      it('offers no more bots once the draft has 12 players', async () => {
        const bots = Array.from({ length: 12 }, (_, i) => ({
          ...bot,
          id: `bot:${i}`,
          name: `Bot ${i + 1}`,
        }));
        const { page } = await openDraft(complete, { players: bots }, { user: admin });

        expect(button(page, 'Add bot')?.disabled).toBe(true);
      });

      it('offers bot controls only to app admins, not the organizer', async () => {
        const { page } = await openDraft(complete, { players: [alicePlayer, bot] });

        expect(button(page, 'Add bot')).toBeUndefined();
        expect(button(page, 'Remove Bot 1')).toBeUndefined();
      });

      it('offers no bot controls once the draft has started', async () => {
        const { page } = await openDraft(
          complete,
          {
            state: 'Drafting',
            players: [alicePlayer, bot],
            turn: { pick: 1, round: 1, playerId: alice.id },
          },
          { user: admin },
        );

        expect(button(page, 'Add bot')).toBeUndefined();
        expect(button(page, 'Remove Bot 1')).toBeUndefined();
      });
    });

    describe('live updates', () => {
      const complete: PoolSnapshotView = { state: 'Complete', cards: 540, total: 540 };
      const drafting = (fields: Partial<DraftView> = {}) =>
        draft({
          state: 'Drafting',
          players: [alicePlayer, bob],
          turn: { pick: 1, round: 1, playerId: alice.id },
          ...fields,
        });
      const shivan: PoolCardView = {
        scryfallId: 'shivan-id',
        oracleId: 'shivan-oracle',
        name: 'Shivan Dragon',
        set: 'm10',
        collectorNumber: '155',
        typeLine: 'Creature — Dragon',
        colors: ['R'],
        manaValue: 6,
        manaCost: '{4}{R}{R}',
        oracleText: 'Flying\n{R}: Shivan Dragon gets +1/+0 until end of turn.',
        colorIdentity: ['R'],
        keywords: ['Flying'],
        rarity: 'rare',
        layout: 'normal',
        power: '5',
        toughness: '5',
        loyalty: null,
        defense: null,
        faces: [],
        images: [{ small: 's.jpg', normal: 'n.jpg', large: 'l.jpg' }],
      };
      const shivanPick: PickView = {
        pick: 1,
        playerId: alice.id,
        oracleId: 'shivan-oracle',
        name: 'Shivan Dragon',
      };

      it('watches the draft it shows', async () => {
        await openDraft(complete, drafting());

        expect(updates.watch).toHaveBeenCalledWith('draft-1');
      });

      it('shows another player’s pick on the Pool, Board and Me tabs, and the turn passing', async () => {
        const { fixture, page } = await openDraft(complete, drafting(), { cards: [shivan] });
        expect(page.textContent).toContain('Your turn: pick 1, round 1');

        updates.events.next({
          type: 'changed',
          draft: drafting({ turn: { pick: 2, round: 1, playerId: bob.id } }),
        });
        await flushPicks([shivanPick]);
        await fixture.whenStable();

        expect(page.textContent).toContain('Bob’s turn: pick 2, round 1');
        expect(page.querySelector('.tile')?.classList).toContain('picked');
        tabButton(page, 'Board').click();
        await fixture.whenStable();
        expect(panel(page).querySelector('.log')?.textContent).toContain('Shivan Dragon');
        tabButton(page, 'Me').click();
        await fixture.whenStable();
        expect(panel(page).textContent).toContain('Shivan Dragon');
      });

      it('follows the draft out of the lobby when the organizer starts it', async () => {
        const { fixture, page } = await openDraft(complete, {
          players: [alicePlayer, bob],
        });

        updates.events.next({ type: 'changed', draft: drafting() });
        await flushPicks([]);
        await fixture.whenStable();

        expect(page.textContent).toContain('Drafting');
        expect(page.textContent).toContain('Your turn: pick 1, round 1');
      });

      it('ignores a pushed draft older than the one it shows', async () => {
        const { fixture, page } = await openDraft(
          complete,
          drafting({ turn: { pick: 2, round: 1, playerId: bob.id }, version: 5 }),
          { cards: [shivan], picks: [shivanPick] },
        );

        updates.events.next({ type: 'changed', draft: drafting({ version: 4 }) });
        await fixture.whenStable();

        expect(page.textContent).toContain('Bob’s turn: pick 2, round 1');
        http.expectNone('/api/drafts/draft-1/picks');
      });

      it('stops watching when the page closes', async () => {
        await openDraft(complete, drafting());
        expect(updates.events.observed).toBe(true);

        await router.navigateByUrl('/');
        (await vi.waitFor(() => http.expectOne('/api/drafts'))).flush([]);

        expect(updates.events.observed).toBe(false);
      });

      it('catches up with the draft and its picks when it reconnects', async () => {
        const { fixture, page } = await openDraft(complete, drafting(), { cards: [shivan] });

        updates.events.next({ type: 'connected' });
        (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(
          drafting({ turn: { pick: 2, round: 1, playerId: bob.id } }),
        );
        await flushPicks([shivanPick]);
        await fixture.whenStable();

        expect(page.textContent).toContain('Bob’s turn: pick 2, round 1');
        expect(page.querySelector('.tile')?.classList).toContain('picked');
      });
    });

    it('says when the draft cannot be loaded', async () => {
      const { fixture, page } = await open('/drafts/draft-1');
      http.expectOne('/api/drafts/draft-1').flush({}, { status: 404, statusText: 'Not Found' });
      await fixture.whenStable();

      expect(page.querySelector('.error')?.textContent).toContain("Couldn't load this draft");
    });
  });

  describe('create form', () => {
    const main = { id: 'webhook-main', name: '#roto-main' };
    const side = { id: 'webhook-side', name: '#roto-side' };

    /** Opens the form with GET /api/webhooks answered by `webhooks`. */
    async function openForm(webhooks: WebhookView[] = []) {
      const { fixture, page } = await open('/drafts/new');
      http.expectOne('/api/webhooks').flush(webhooks);
      await fixture.whenStable();
      return { fixture, page };
    }

    function fill(page: HTMLElement, field: string, value: string) {
      const input = page.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        `[name="${field}"]`,
      )!;
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

    it('starts picks per player at 40', async () => {
      const { page } = await openForm();

      expect(page.querySelector<HTMLInputElement>('[name="picksPerPlayer"]')?.value).toBe('40');
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
        webhookId: null,
      });
      req.flush(draft({ id: 'draft-9', picksPerPlayer: 30 }), {
        status: 201,
        statusText: 'Created',
      });

      await vi.waitFor(() => expect(router.url).toBe('/drafts/draft-9'));
      http.expectOne('/api/drafts/draft-9').flush(draft({ id: 'draft-9' }));
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-9/pool'))).flush([]);
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
      req.flush({ error: 'invalid', message: 'Stop here.' }, { status: 400, statusText: 'Error' });
    });

    it('can post nowhere', async () => {
      const form = await openForm([main]);
      chooseWebhook(form.page, 'None');

      const req = await create(form);
      expect(req.request.body.webhookId).toBeNull();
      req.flush({ error: 'invalid', message: 'Stop here.' }, { status: 400, statusText: 'Error' });
    });

    it('offers only None when no webhooks are registered', async () => {
      const { page } = await openForm([]);

      expect(webhookOptions(page).map((option) => option.textContent?.trim())).toEqual(['None']);
      expect(chosenWebhook(page)).toBe('None');
    });

    it('still creates a draft, posting nowhere, when the webhooks fail to load', async () => {
      const { fixture, page } = await open('/drafts/new');
      http
        .expectOne('/api/webhooks')
        .flush(null, { status: 500, statusText: 'Internal Server Error' });
      await fixture.whenStable();

      expect(chosenWebhook(page)).toBe('None');
      const req = await create({ fixture, page });
      expect(req.request.body.webhookId).toBeNull();
      req.flush({ error: 'invalid', message: 'Stop here.' }, { status: 400, statusText: 'Error' });
    });

    function fail(
      req: ReturnType<HttpTestingController['expectOne']>,
      status: number,
      body: object,
    ) {
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
