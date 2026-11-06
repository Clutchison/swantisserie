import { HttpResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import type {
  DraftBase,
  DraftListItemView,
  DraftPowersView,
  DraftState,
  DraftView,
  PickView,
  PlanView,
  PoolCardView,
  PoolSnapshotView,
  TournamentView,
  QueuedCardView,
  QueueView,
  TurnView,
  UserView,
  WebhookView,
} from 'contract';
import { of, Subject } from 'rxjs';
import { App } from '../../app';
import { routes } from '../../app.routes';
import { signOutWhenSessionEnds } from '../../auth/sign-out-when-session-ends';
import { DRAFT_POLL_MS } from '../draft-store';
import { DESKTOP_QUERY, EMPTY_PLAN, EMPTY_QUEUE, NO_POWERS } from '../drafts';
import { type DraftUpdate, DraftUpdates } from '../draft-updates';
import { answerTopBar } from '../../top-bar/specs-harness';
import { alice, button, buttons } from '../../specs-harness';

export { alice, button, buttons };

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
    tournament: null,
    version: 0,
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

export { NO_POWERS };
/** The draft powers of a viewer who may only organize. */
export const ORGANIZE_ONLY: DraftPowersView = { ...NO_POWERS, organize: true };
/** The draft powers of a viewer who may only add bots. */
export const ADD_BOTS_ONLY: DraftPowersView = { ...NO_POWERS, addBots: true };
/** The draft powers of a viewer who may only switch announcements. */
export const SWITCH_ANNOUNCEMENTS_ONLY: DraftPowersView = {
  ...NO_POWERS,
  switchAnnouncements: true,
};
/** The draft powers of an app admin: all of them. */
export const ALL_POWERS: DraftPowersView = {
  organize: true,
  addBots: true,
  switchAnnouncements: true,
};

/**
 * What GET /api/drafts/:id/powers answers with, so that a test needn't:
 * every draft page reads them. Null leaves the request to the test.
 */
let registeredPowers: DraftPowersView | null;

/** Has GET /api/drafts/:id/powers answer with `powers`, or (with null) wait for the test to. */
export function powersAnswer(powers: DraftPowersView | null) {
  registeredPowers = powers;
}

/** Registers the hooks that give each test a fresh app and a stand-in API. */
export function useDraftsApp() {
  beforeEach(() => {
    // Spec files share one environment, so a choice saved by an earlier file
    // (such as the Plan tab's List mode) would otherwise carry into this one.
    localStorage.clear();
    decodes = new Map();
    registeredWebhooks = [];
    registeredPowers = NO_POWERS;
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
            signOutWhenSessionEnds,
            (req, next) =>
              req.url === '/api/webhooks' && registeredWebhooks
                ? of(new HttpResponse({ body: registeredWebhooks }))
                : next(req),
            (req, next) =>
              /^\/api\/drafts\/[^/]+\/powers$/.test(req.url) && registeredPowers
                ? of(new HttpResponse({ body: registeredPowers }))
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

/**
 * Opens the draft list with GET /api/drafts answered by `drafts`, each
 * without a tournament badge unless it gives one.
 */
export async function openList(drafts: (DraftView & Partial<DraftListItemView>)[]) {
  const { fixture, page } = await openUrl('/');
  http
    .expectOne('/api/drafts')
    .flush(drafts.map((each): DraftListItemView => ({ tournamentBadge: null, ...each })));
  await fixture.whenStable();
  return page;
}

/** The draft list's item for the draft named `name`, by its accessible name. */
export function listItem(page: HTMLElement, name: string): HTMLElement {
  const found = [...page.querySelectorAll('li')].find(
    (li) => li.getAttribute('aria-label') === name,
  );
  if (!found) throw new Error(`No draft named ${name} in the list`);
  return found;
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

/** A pick, Alice's and the draft's first, with `fields` changed. */
export const pickOf = (fields: Partial<PickView> = {}): PickView => ({
  pick: 1,
  playerId: alice.id,
  poolCardId: '',
  ...fields,
});

/** Scryfall's image URL for one face of a printing. */
export const image = (version: string, id: string, face = 'front') =>
  `https://cards.scryfall.io/${version}/${face}/${id}.jpg`;

/** A printing's images, one entry per face, as a pool card holds them. */
export const faceImages = (scryfallId: string, faces = ['front']) =>
  faces.map((face) => ({
    small: image('small', scryfallId, face),
    normal: image('normal', scryfallId, face),
    large: image('large', scryfallId, face),
  }));

/**
 * A pool card named `name`, with the id `${id}-card`: a normal red instant
 * printed as IMA 1, with `fields` changed.
 */
export const poolCardOf = (
  id: string,
  name: string,
  fields: Partial<PoolCardView> = {},
): PoolCardView => ({
  id: `${id}-card`,
  scryfallId: `${id}-id`,
  name,
  set: 'ima',
  collectorNumber: '1',
  typeLine: 'Instant',
  colors: ['R'],
  manaValue: 1,
  manaCost: '{R}',
  oracleText: null,
  colorIdentity: ['R'],
  keywords: [],
  rarity: 'common',
  layout: 'normal',
  power: null,
  toughness: null,
  loyalty: null,
  defense: null,
  faces: [],
  images: faceImages(`${id}-id`),
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

/**
 * What a screen reader names `element`: its aria-label, or else its text and
 * images' alt text, leaving out what's hidden from assistive tech. A rough
 * take on the accessible name computation, enough for buttons and tiles.
 */
export function accessibleName(element: Element): string {
  const nameOf = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
    if (!(node instanceof Element)) return '';
    if (node.getAttribute('aria-hidden') === 'true' || node.hasAttribute('hidden')) return '';
    const label = node.getAttribute('aria-label');
    if (label) return label;
    if (node instanceof HTMLImageElement) return node.alt;
    return [...node.childNodes].map(nameOf).join(' ');
  };
  return nameOf(element).replace(/\s+/g, ' ').trim();
}

/** A link inside `root`, by its accessible name. */
export const link = (root: HTMLElement, name: string) =>
  [...root.querySelectorAll<HTMLAnchorElement>('a[href]')].find((a) => accessibleName(a) === name);

/** A heading inside `root`, by its accessible name. */
export const heading = (root: HTMLElement, name: string) =>
  [...root.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6, [role="heading"]')].find(
    (element) => accessibleName(element) === name,
  );

/** The images inside `root` that a screen reader names, in page order. */
export const namedImages = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLImageElement>('img')].filter((image) => image.alt !== '');

/** `element`'s text as a viewer reads it, its whitespace collapsed; empty if there is no element. */
export const text = (element: Element | null | undefined) =>
  (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

/** A region inside `root`, such as a section, by its accessible name; null if there is none. */
export const region = (root: HTMLElement, name: string) =>
  [...root.querySelectorAll<HTMLElement>('section[aria-label], [role="region"]')].find(
    (element) => element.getAttribute('aria-label') === name,
  ) ?? null;

/** A group of controls inside `root`, by its accessible name; null if there is none. */
export const group = (root: HTMLElement, name: string) =>
  [...root.querySelectorAll<HTMLElement>('[role="group"]')].find(
    (element) => element.getAttribute('aria-label') === name,
  ) ?? null;

/** The first alert inside `root`: an error shown to the viewer, if any. */
export const alertIn = (root: HTMLElement) => root.querySelector<HTMLElement>('[role="alert"]');

/** The app's header, shown to signed-in viewers. */
export const banner = (root: HTMLElement) => root.querySelector<HTMLElement>('[role="banner"]');

/**
 * Expects `user` to have been signed out of this tab because the API ended
 * their session: sent to sign-in, to return to `returnTo` (the page they were
 * on) once signed in, gone from the header, and the API not told.
 * Takes the router and HTTP mock as specs outside the drafts app have their own.
 */
export async function expectSignedOut(
  fixture: ComponentFixture<unknown>,
  {
    router,
    http,
    user,
    returnTo,
  }: { router: Router; http: HttpTestingController; user: UserView; returnTo?: string },
) {
  const signIn = returnTo ? `/sign-in?${new URLSearchParams({ returnTo })}` : '/sign-in';
  await vi.waitFor(() => expect(router.url).toBe(signIn));
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

/** The text of every status message inside `root`, with its whitespace collapsed. */
export const statusTexts = (root: HTMLElement) =>
  [...root.querySelectorAll('[role="status"]')].map((el) =>
    (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
  );

/** A list inside `root`, by its accessible name, such as "Pick log" or "Your picks". */
export const namedList = (root: HTMLElement, name: string) =>
  root.querySelector<HTMLElement>(`[aria-label="${name}"]`)!;

/** Each item's text in the list inside `root` named `name`, in order. */
export const items = (root: HTMLElement, name: string) =>
  [...namedList(root, name).querySelectorAll('li')].map((li) => text(li));

/** The card names inside `root`, each the name a card preview opens from, in page order. */
export const cardNames = (root: HTMLElement) => [
  ...root.querySelectorAll<HTMLElement>('app-card-name .name'),
];

/** A card name inside `root`, by its visible text. */
export const cardName = (root: HTMLElement, name: string) =>
  cardNames(root).find((span) => span.textContent?.trim() === name)!;

/** The list of the cards in the signed-in player's queue, inside `root`, by its name. */
export const queueList = (root: HTMLElement) =>
  root.querySelector<HTMLElement>('[aria-label="Your queue"]')!;

/** The Queue tab's picks left count, found by its text. */
export const picksLeftCount = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>('*')].find((element) =>
    /^\d+ picks? left$/.test(element.textContent.trim()),
  );

/** The form controls with each role, by the selector that finds them. */
const CONTROLS = {
  textbox: 'textarea, input:not([type]), input[type="text"], input[type="url"]',
  spinbutton: 'input[type="number"]',
  radio: 'input[type="radio"]',
  checkbox: 'input[type="checkbox"]',
  combobox: 'select',
} as const;
type ControlRole = keyof typeof CONTROLS;
type ControlOf = {
  textbox: HTMLInputElement | HTMLTextAreaElement;
  spinbutton: HTMLInputElement;
  radio: HTMLInputElement;
  checkbox: HTMLInputElement;
  combobox: HTMLSelectElement;
};

/**
 * A label's own text, and the alt text of an image it holds in place of
 * text, leaving out any hint, option or other element it wraps.
 */
const ownText = (label: HTMLLabelElement) =>
  [...label.childNodes]
    .map((node) =>
      node.nodeType === Node.TEXT_NODE
        ? node.textContent
        : node instanceof HTMLImageElement
          ? node.alt
          : '',
    )
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Every form control inside `root` with this role and label, in page order. */
export const controlsByLabel = <R extends ControlRole>(root: HTMLElement, role: R, label: string) =>
  [...root.querySelectorAll<ControlOf[R]>(CONTROLS[role])].filter((control) =>
    [...(control.labels ?? [])].some((l) => ownText(l) === label),
  );

/** A form control inside `root`, by its role and its label's own text. */
export const controlByLabel = <R extends ControlRole>(root: HTMLElement, role: R, label: string) =>
  controlsByLabel(root, role, label)[0];

/** The buttons in the tab bar, in order. */
export const tabs = (root: HTMLElement) => [
  ...root.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
];
/** A button in the tab bar, by its label. */
export const tabButton = (root: HTMLElement, tab: string) =>
  tabs(root).find((b) => b.textContent?.trim() === tab)!;
/** The tab bar's labels, in order. */
export const tabLabels = (root: HTMLElement) => tabs(root).map((tab) => tab.textContent?.trim());
/** The panel of the tab labelled `tab`, whether it is showing or not. */
export const tabPanel = (root: HTMLElement, tab: string) =>
  root.querySelector<HTMLElement>(`#${tabButton(root, tab).getAttribute('aria-controls')}`)!;
/** The tab panel showing. */
export const panel = (root: HTMLElement) =>
  root.querySelector<HTMLElement>('[role="tabpanel"]:not([hidden])')!;
/** The name of the tab panel showing: the label of the tab it is labelled by. */
export const panelName = (root: HTMLElement) => {
  const labelledBy = panel(root)?.getAttribute('aria-labelledby');
  return labelledBy ? root.querySelector(`#${labelledBy}`)?.textContent?.trim() : undefined;
};

/**
 * Opens draft-1's page with the first GET answered by `snapshot`, its pool
 * cards by `cards` once the snapshot is complete, and its picks by
 * `picks` once the draft has started, and their queue by `queue` and
 * plan by `plan` if they are a player, and its tournament by `tournament`
 * if the draft has one, signed in as `user`, whose draft powers are `powers` (as `powersAnswer` sets them: none, unless told otherwise),
 * at `url`: the draft's plain URL, unless told otherwise.
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
    tournament,
    user = alice,
    powers,
    url = '/drafts/draft-1',
  }: {
    cards?: PoolCardView[];
    picks?: PickView[];
    queue?: QueueView;
    plan?: PlanView;
    tournament?: TournamentView;
    user?: typeof alice;
    powers?: DraftPowersView;
    url?: string;
  } = {},
) {
  if (powers) powersAnswer(powers);
  const { fixture, page } = await openUrl(url, user);
  const opened = draft({ snapshot, ...fields });
  http.expectOne('/api/drafts/draft-1').flush(opened);
  if (snapshot.state === 'Complete') await flushPool(cards);
  if (opened.state !== 'Lobby') await flushPicks(picks);
  if (opened.players.some((player) => player.id === user.id)) {
    await flushQueueAndPlan(queue, plan);
  }
  if (opened.tournament) {
    if (!tournament) throw new Error('A draft with a tournament needs `tournament` to read.');
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/tournament'))).flush(tournament);
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

/** The images of the Card previews open: one at most, outside the page. */
export const previewImages = () => [
  ...document.querySelectorAll<HTMLImageElement>('app-card-preview img'),
];
/** The Card preview's image, if one is open: it's outside the page. */
export const previewImage = () => previewImages()[0] ?? null;

/**
 * An element inside `root` given a Tab stop of its own, as a card name with
 * a Card preview is, by its accessible name; buttons and links aren't, as
 * they are Tab stops already.
 */
export const ownTabStop = (root: HTMLElement, name: string) =>
  [...root.querySelectorAll<HTMLElement>('[tabindex="0"]')].find(
    (element) => accessibleName(element) === name,
  );

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
