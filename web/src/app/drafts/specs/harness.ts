import { HttpResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import type {
  DraftBase,
  DraftState,
  DraftView,
  PickView,
  PlanView,
  PoolCardView,
  PoolSnapshotView,
  QueuedCardView,
  QueueView,
  TurnView,
  UserView,
  WebhookView,
} from 'contract';
import { of, Subject } from 'rxjs';
import { App } from '../../app';
import { routes } from '../../app.routes';
import { DRAFT_POLL_MS } from '../draft-page';
import { DESKTOP_QUERY, EMPTY_PLAN, EMPTY_QUEUE } from '../drafts';
import { type DraftUpdate, DraftUpdates } from '../draft-updates';
import { answerTopBar } from '../../top-bar/specs-harness';
import { alice } from '../../specs-harness';

export { alice };

export const completeSnapshot: PoolSnapshotView = { state: 'Complete', cards: 540, total: 540 };

/**
 * A test's changes to the default draft. Any state goes with any turn here,
 * so partial fixtures spread into each other type-check; `draft` checks they
 * match instead.
 */
export type DraftFixture = Partial<DraftBase> & { state?: DraftState; turn?: TurnView | null };

/**
 * The default draft with `fields` changed. A Drafting or Paused draft given no
 * turn gets the first pick's, its first player's or Alice's; a turn that
 * doesn't match the state throws.
 */
export function draft(fields: DraftFixture): DraftView {
  const { state = 'Lobby', turn, ...rest } = fields;
  const made: DraftBase = {
    id: 'draft-1',
    name: 'Red dragons',
    poolSource: { kind: 'pool-query', poolQuery: 't:dragon c:r' },
    picksPerPlayer: 40,
    platform: 'Arena',
    organizer: { id: alice.id, name: alice.name },
    snapshot: completeSnapshot,
    players: [],
    webhook: null,
    version: 0,
    createdAt: '2026-10-29T12:00:00.000Z',
    ...rest,
  };
  if (state === 'Drafting' || state === 'Paused') {
    if (turn === null) throw new Error(`A ${state} draft needs a turn.`);
    const first = { pick: 1, round: 1, playerId: made.players[0]?.id ?? alice.id };
    return { ...made, state, turn: turn ?? first };
  }
  if (turn) throw new Error(`A ${state} draft has no turn.`);
  return { ...made, state, turn: null };
}

export type AppFixture = ComponentFixture<App>;

export let http: HttpTestingController;
export let router: Router;
/** Stands in for the API's Socket.IO gateway: push events through `events`. */
export let updates: { events: Subject<DraftUpdate>; watch: ReturnType<typeof vi.fn> };

/**
 * What GET /api/webhooks answers with, without a test having to: every view
 * an organizer opens loads them. Null leaves the request to the test.
 */
let registeredWebhooks: WebhookView[] | null;

/** Has GET /api/webhooks answer with `webhooks`, or (with null) wait for the test to. */
export function webhooksAnswer(webhooks: WebhookView[] | null) {
  registeredWebhooks = webhooks;
}

/** Registers the hooks that give each test a fresh app and a stand-in API. */
export function useDraftsApp() {
  beforeEach(() => {
    // Spec files share one environment, so a choice saved by an earlier file
    // (such as the Plan tab's List mode) would otherwise carry into this one.
    localStorage.clear();
    decodes = new Map();
    registeredWebhooks = [];
    HTMLImageElement.prototype.decode = function (this: HTMLImageElement) {
      return new Promise((resolve, reject) => decodes.set(this, { resolve, reject }));
    };
    const events = new Subject<DraftUpdate>();
    updates = { events, watch: vi.fn(() => events) };
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes, withComponentInputBinding()),
        provideHttpClient(
          withInterceptors([
            (req, next) =>
              req.url === '/api/webhooks' && registeredWebhooks
                ? of(new HttpResponse({ body: registeredWebhooks }))
                : next(req),
          ]),
        ),
        provideHttpClientTesting(),
        { provide: DRAFT_POLL_MS, useValue: 5 },
        { provide: DraftUpdates, useValue: updates },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => http.verify());
  // Hooks run last-registered first, so a failed verify can't skip this.
  afterEach(() => vi.restoreAllMocks());
}

/** The images waiting on the browser to decode them, which jsdom never does. */
let decodes: Map<HTMLImageElement, { resolve: () => void; reject: () => void }>;

/** The browser finishes decoding `img`. */
export async function decoded(img: HTMLImageElement) {
  decodes.get(img)!.resolve();
  await Promise.resolve();
  TestBed.tick();
}

/** The browser refuses to decode `img`. */
export async function decodeRefused(img: HTMLImageElement) {
  decodes.get(img)!.reject();
  await Promise.resolve();
  TestBed.tick();
}

/** Opens `url` as `user`: Alice, unless told otherwise. */
export async function openUrl(url: string, user: UserView = alice) {
  const fixture = TestBed.createComponent(App);
  const navigation = router.navigateByUrl(url);
  (await vi.waitFor(() => http.expectOne('/api/auth/me'))).flush(user);
  await navigation;
  TestBed.tick();
  answerTopBar(http);
  return { fixture, page: fixture.nativeElement as HTMLElement };
}

/** Waits out a load's delay, then checks it shows its text under a logo of the given width. */
export async function expectLoadingAnimation(
  root: () => Element,
  text: string,
  logoWidth: 288 | 64,
) {
  await vi.waitFor(() => {
    TestBed.tick();
    const loading = root().querySelector('app-loading-animation');
    expect(loading?.textContent).toContain(text);
    expect(loading?.querySelector('svg')?.getAttribute('width')).toBe(String(logoWidth));
  });
}

/** Opens the draft list with GET /api/drafts answered by `drafts`. */
export async function openList(drafts: DraftView[]) {
  const { fixture, page } = await openUrl('/');
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

/** A Drafting draft with `fields` changed: Alice then Bob, with Bob up on the first pick. */
export const drafting = (fields: DraftFixture = {}): DraftFixture => ({
  state: 'Drafting',
  players: [alicePlayer, bob],
  turn: { pick: 1, round: 1, playerId: bob.id },
  ...fields,
});

/** A pool card as a queue or a plan names it: by its id and name. */
export type NamedPoolCard = Pick<PoolCardView, 'id' | 'name'>;

/** A card as a queue lists it. */
export const queued = (card: NamedPoolCard): QueuedCardView => ({
  poolCardId: card.id,
  name: card.name,
});

/**
 * An empty queue, under Clear queue, with `fields` changed. Only a queue that
 * lost a card can say whether the rest was kept.
 */
export const queueOf = (
  fields: Partial<Pick<QueueView, 'cards' | 'cleared' | 'stealBehavior'>> &
    (
      | { lost?: []; restKept?: false }
      | { lost: [QueuedCardView, ...QueuedCardView[]]; restKept?: boolean }
    ) = {},
): QueueView => ({
  cards: [],
  lost: [],
  cleared: [],
  restKept: false,
  stealBehavior: 'ClearQueue',
  ...fields,
});

/** A pick of a normal card, Alice's and the draft's first, with `fields` changed. */
export const pickOf = (fields: Partial<PickView> = {}): PickView => ({
  pick: 1,
  playerId: alice.id,
  poolCardId: '',
  name: '',
  layout: 'normal',
  typeLine: '',
  set: '',
  collectorNumber: '',
  ...fields,
});

/**
 * The avatar beside a player's name in the Players section. An avatar is
 * decorative, so it has no name of its own: it is found by its role within
 * the list item that names the player.
 */
export const playerAvatar = (page: HTMLElement, name: string) =>
  [...section(page, 'Players').querySelectorAll('li')]
    .find((li) => li.textContent?.includes(name))
    ?.querySelector<HTMLImageElement>('[role="presentation"]');

/** A button inside `root`, by its text or its aria-label. */
export const button = (root: HTMLElement, label: string) =>
  [...root.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === label || b.getAttribute('aria-label') === label,
  );

/** The app's header, shown to signed-in viewers. */
export const banner = (root: HTMLElement) => root.querySelector<HTMLElement>('[role="banner"]');

/**
 * Expects `user` to have been signed out of this tab because the API ended
 * their session: sent to sign-in, gone from the header, and the API not told.
 * Takes the router and HTTP mock as specs outside the drafts app have their own.
 */
export async function expectSignedOut(
  fixture: ComponentFixture<unknown>,
  { router, http, user }: { router: Router; http: HttpTestingController; user: UserView },
) {
  await vi.waitFor(() => expect(router.url).toBe('/sign-in'));
  await fixture.whenStable();

  const page = fixture.nativeElement as HTMLElement;
  expect(page.textContent).toContain('Sign in with Discord');
  expect(banner(page)?.textContent ?? '').not.toContain(user.name);
  // The session is already gone: there's nothing to log out of.
  http.expectNone('/api/auth/logout');
}

/** A status message inside `root`, by its text. */
export const statusMessage = (root: HTMLElement, text: string) =>
  [...root.querySelectorAll('[role="status"]')].find((el) => el.textContent?.trim() === text);

/** A select inside `root`, by its label's own text (leaving out its options'). */
export const selectByLabel = (root: HTMLElement, label: string) =>
  [...root.querySelectorAll('select')].find((select) =>
    [...(select.labels ?? [])].some(
      (l) => l.textContent?.replace(select.textContent ?? '', '').trim() === label,
    ),
  );

/** A button in the tab bar, by its label. */
export const tabButton = (root: HTMLElement, tab: string) =>
  [...root.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
    (b) => b.textContent?.trim() === tab,
  )!;
/** The tab panel showing. */
export const panel = (root: HTMLElement) =>
  root.querySelector<HTMLElement>('[role="tabpanel"]:not([hidden])')!;

/**
 * Opens draft-1's page with the first GET answered by `snapshot`, its pool
 * cards by `cards` once the snapshot is complete, and its picks by
 * `picks` once the draft has started, and their queue by `queue` and
 * plan by `plan` if they are a player, signed in as `user`.
 *
 * Once open, a change's answer (`req.flush(...)`) shows a moment after
 * `fixture.whenStable()` resolves, as it arrives through a promise: assert
 * what it shows inside `vi.waitFor`, unless the change showed it early.
 *
 * One draft per test: the app and its stand-in API are made once per test,
 * so a second `openDraft` in the same test fails. Cases that differ only in
 * the draft's fields are an `it.each`.
 */
export async function openDraft(
  snapshot: PoolSnapshotView,
  fields: DraftFixture = {},
  {
    cards = [],
    picks = [],
    queue = EMPTY_QUEUE,
    plan = EMPTY_PLAN,
    user = alice,
  }: {
    cards?: PoolCardView[];
    picks?: PickView[];
    queue?: QueueView;
    plan?: PlanView;
    user?: typeof alice;
  } = {},
) {
  const { fixture, page } = await openUrl('/drafts/draft-1', user);
  const opened = draft({ snapshot, ...fields });
  http.expectOne('/api/drafts/draft-1').flush(opened);
  if (snapshot.state === 'Complete') await flushPool(cards);
  if (opened.state !== 'Lobby') await flushPicks(picks);
  if (opened.players.some((player) => player.id === user.id)) {
    await flushQueueAndPlan(queue, plan);
  }
  await fixture.whenStable();
  return { fixture, page };
}

/**
 * Answers the page's GETs of the signed-in player's queue and plan, which it
 * makes on opening a draft they play in and again on every version change.
 */
export async function flushQueueAndPlan(queue = EMPTY_QUEUE, plan = EMPTY_PLAN) {
  await flushQueue(queue);
  await flushPlan(plan);
}

/** Answers the page's GET of the signed-in player's plan with `plan`. */
export async function flushPlan(plan: PlanView) {
  (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/plan'))).flush(plan);
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

/** The next poll of the draft, answered with `snapshot`. */
export async function poll(fixture: AppFixture, snapshot: PoolSnapshotView) {
  (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(draft({ snapshot }));
  if (snapshot.state === 'Complete') await flushPool();
  await fixture.whenStable();
}

/** What the page has asked to hear of the desktop breakpoint's changes. */
let breakpointListeners: ((event: { matches: boolean }) => void)[] = [];

/**
 * Puts the page on a desktop or a mobile screen, by the draft page's
 * breakpoint, for the test to come. Undo it with `vi.unstubAllGlobals()`.
 */
export function viewOn(screen: 'desktop' | 'mobile') {
  breakpointListeners = [];
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: screen === 'desktop' && query === DESKTOP_QUERY,
    addEventListener: (_type: 'change', listener: (event: { matches: boolean }) => void) => {
      if (query === DESKTOP_QUERY) breakpointListeners.push(listener);
    },
  }));
}

/** Resizes the window across the draft page's breakpoint, onto `screen`, and renders what came of it. */
export function resizeTo(screen: 'desktop' | 'mobile') {
  breakpointListeners.forEach((listener) => listener({ matches: screen === 'desktop' }));
  TestBed.tick();
}

/** Lets `ms` pass on the fake timers, then renders what came of it. */
export function wait(ms: number) {
  vi.advanceTimersByTime(ms);
  TestBed.tick();
}

/** Opens the tab named `name` and returns its panel. */
export async function openTab(fixture: AppFixture, page: HTMLElement, name: string) {
  tabButton(page, name).click();
  await fixture.whenStable();
  return panel(page);
}

/** Opens the Queue tab and returns its panel. */
export const openQueue = (fixture: AppFixture, page: HTMLElement) =>
  openTab(fixture, page, 'Queue');

/** The Card preview's image, if one is open: it's outside the page. */
export const previewImage = () => document.querySelector<HTMLImageElement>('app-card-preview img');

/** A pointer event of `pointerType`; only a press bubbles, as enter and leave don't. */
export const pointer = (type: string, pointerType: string) =>
  new PointerEvent(type, { pointerType, bubbles: type === 'pointerdown' });

/** Taps `target` on a touchscreen, with the enter and leave a touch brings, and renders what came of it. */
export function tap(target: HTMLElement) {
  target.dispatchEvent(pointer('pointerenter', 'touch'));
  target.dispatchEvent(pointer('pointerdown', 'touch'));
  target.dispatchEvent(pointer('pointerleave', 'touch'));
  target.click();
  TestBed.tick();
}
