import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { Subject } from 'rxjs';
import { App } from '../../app';
import { routes } from '../../app.routes';
import { DRAFT_POLL_MS } from '../draft-page';
import {
  type DraftView,
  EMPTY_QUEUE,
  type PickView,
  type PoolCardView,
  type PoolSnapshotView,
  type QueueView,
} from '../drafts';
import { type DraftUpdate, DraftUpdates } from '../draft-updates';

export const alice = {
  id: '80351110224678912',
  name: 'Alice',
  avatarUrl: 'https://cdn.discordapp.com/embed/avatars/5.png',
  isAdmin: false,
};

export function draft(fields: Partial<DraftView>): DraftView {
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

export let http: HttpTestingController;
export let router: Router;
/** Stands in for the API's Socket.IO gateway: push events through `events`. */
export let updates: { events: Subject<DraftUpdate>; watch: ReturnType<typeof vi.fn> };

/** Registers the hooks that give each test a fresh app and a stand-in API. */
export function useDraftsApp() {
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
}

/** Opens `url` as `user`: Alice, unless told otherwise. */
export async function open(url: string, user = alice) {
  const fixture = TestBed.createComponent(App);
  const navigation = router.navigateByUrl(url);
  (await vi.waitFor(() => http.expectOne('/api/auth/me'))).flush(user);
  await navigation;
  TestBed.tick();
  return { fixture, page: fixture.nativeElement as HTMLElement };
}

/** Opens the draft list with GET /api/drafts answered by `drafts`. */
export async function openList(drafts: DraftView[]) {
  const { fixture, page } = await open('/');
  http.expectOne('/api/drafts').flush(drafts);
  await fixture.whenStable();
  return page;
}

export function section(page: HTMLElement, heading: string): HTMLElement {
  const found = [...page.querySelectorAll('section')].find((s) =>
    s.querySelector('h2')?.textContent?.includes(heading),
  );
  if (!found) throw new Error(`No section headed ${heading}`);
  return found;
}

export const bob = {
  id: 'bob',
  name: 'Bob',
  avatarUrl: 'https://cdn.discordapp.com/embed/avatars/1.png',
  isBot: false,
};
export const alicePlayer = {
  id: alice.id,
  name: alice.name,
  avatarUrl: alice.avatarUrl,
  isBot: false,
};

/** A button in the tab bar, by its label. */
export const tabButton = (root: HTMLElement, tab: string) =>
  [...root.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
    (button) => button.textContent?.trim() === tab,
  )!;
/** The tab panel showing. */
export const panel = (root: HTMLElement) =>
  root.querySelector<HTMLElement>('[role="tabpanel"]:not([hidden])')!;

/**
 * Opens draft-1's page with the first GET answered by `pool`, its pool
 * cards by `cards` once the snapshot is complete, and its picks by
 * `picks` once the draft has started, and their queue by `queue` if
 * they are a player, signed in as `user`.
 */
export async function openDraft(
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
export async function flushQueue(queue: QueueView) {
  (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/queue'))).flush(queue);
}

/** Answers the page's GET of draft-1's pick log with `picks`. */
export async function flushPicks(picks: PickView[]) {
  (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/picks'))).flush(picks);
}

/**
 * Answers the page's GET of draft-1's pool cards with `cards`. The page
 * isn't stable until it's answered.
 */
export async function flushPool(cards: PoolCardView[] = []) {
  (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/pool'))).flush(cards);
}

/** The next poll of the draft, answered with `pool`. */
export async function poll(fixture: { whenStable(): Promise<unknown> }, pool: PoolSnapshotView) {
  (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(draft({ snapshot: pool }));
  if (pool.state === 'Complete') await flushPool();
  await fixture.whenStable();
}
