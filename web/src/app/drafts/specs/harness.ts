import { HttpResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import {
  GuardsCheckEnd,
  NavigationEnd,
  provideRouter,
  Router,
  withComponentInputBinding,
} from '@angular/router';
import type {
  CardFace,
  DecklistView,
  DraftBase,
  DraftListItemView,
  DraftPowersView,
  DraftState,
  DraftView,
  PickView,
  PlanView,
  PoolCardView,
  PoolSnapshotView,
  ViewerTournamentView,
  QueuedCardView,
  LostQueuedCardView,
  QueueView,
  TurnView,
  UserView,
  WebhookView,
} from 'contract';
import { isTurnState } from 'contract';
import { currentTurn } from 'engine';
import { of, Subject } from 'rxjs';
import { App } from '../../app';
import { routes } from '../../app.routes';
import { signOutWhenSessionEnds } from '../../auth/sign-out-when-session-ends';
import { DRAFT_POLL_MS } from '../draft-store';
import { SET_CATALOG_POLL_MS } from '../set-list-picker';
import { EMPTY_PLAN, EMPTY_QUEUE, NO_POWERS } from '../drafts';
import { type DraftUpdate, DraftUpdates } from '../draft-updates';
import { answerTopBar } from '../../top-bar/specs-harness';
import { disclosure } from './disclosure-harness';
import {
  accessibleName,
  alertIn,
  alice,
  answerViewerDrafts,
  button,
  buttons,
  byAriaLabel,
  byName,
  collapseWhitespace,
  opensDraftList,
  serverError,
  table,
  tableRows,
  text,
} from '../../specs-harness';

export { accessibleName, alertIn, alice, button, buttons, serverError, table, tableRows, text };
export { resizeTo, viewOn } from './screen-harness';
export { draggable, dragHandle, dropAt, startDrag, touchDrag } from './drag-harness';
export {
  chooseInOpenRowMenu,
  chooseInRowMenu,
  endJustAddedHighlight,
  findNextUpStrip,
  findQueuePane,
  findQueuePlayPauseButton,
  justAddedCards,
  nextUpStrip,
  openQueueSheet,
  openRowMenu,
  pickChangesQueue,
  queueList,
  queueNotice,
  queuePane,
  queuePaneToggle,
  queuePlayPauseButton,
  queueRowNames,
  queueSheet,
  queueStatuses,
  rowMenu,
  rowMenuName,
} from './queue-harness';

/** What the draft page alerts when the organizer's Retry of a failed snapshot fails. */
export const RETRY_FAILED = "Couldn't restart the snapshot. Try again in a moment.";

export const completeSnapshot: PoolSnapshotView = { state: 'Complete', cards: 540, total: 540 };

/**
 * A test's changes to the default draft. Any state goes with any turn here,
 * so partial fixtures spread into each other type-check; `draft` checks they
 * match instead.
 */
export type DraftFixture = Partial<DraftBase> & { state?: DraftState; turn?: FixtureTurn | null };

/** A turn as a fixture gives it: a single turn, with 1 pick before it passes, unless it says otherwise. */
export type FixtureTurn = Omit<TurnView, 'picksBeforeTurnPasses'> &
  Partial<Pick<TurnView, 'picksBeforeTurnPasses'>>;

/**
 * The default draft with `fields` changed. A Drafting or Frozen draft given no
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
    doublePicks: 0,
    platform: 'Arena',
    organizer: { id: alice.id, name: alice.name },
    snapshot: completeSnapshot,
    players: [],
    webhook: null,
    tournament: null,
    version: 0,
    ...rest,
  };
  if (isTurnState(state)) {
    if (turn === null) throw new Error(`A ${state} draft needs a turn.`);
    const first = { pick: 1, round: 1, playerId: made.players[0]?.id ?? alice.id };
    return { ...made, state, turn: { picksBeforeTurnPasses: 1, ...(turn ?? first) } };
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
    // (such as the Deck tab's List mode) would otherwise carry into this one.
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
        { provide: SET_CATALOG_POLL_MS, useValue: 5 },
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

/**
 * Opens `url` as `user`: Alice, unless told otherwise. The app's read of the
 * viewer's drafts finds `viewerDrafts`: none, except on the draft list, where
 * it is left to the test, as it is anywhere given null.
 */
export async function openUrl(
  url: string,
  user: UserView = alice,
  viewerDrafts: DraftListItemView[] | null = opensDraftList(url) ? null : [],
) {
  const fixture = TestBed.createComponent(App);
  const navigation = router.navigateByUrl(url);
  (await vi.waitFor(() => http.expectOne('/api/auth/me'))).flush(user);
  await navigation;
  TestBed.tick();
  answerTopBar(http);
  if (viewerDrafts) answerViewerDrafts(http, viewerDrafts);
  return { fixture, page: fixture.nativeElement as HTMLElement };
}

/** The loading animation inside `root`, its status named "Loading", while something loads; null once nothing does. */
export const loadingAnimation = (root: HTMLElement) =>
  byAriaLabel(root, '[role="status"]', 'Loading');

/** Waits out a load's delay, then checks it shows its text under a logo of the given width. */
export async function expectLoadingAnimation(
  root: () => HTMLElement,
  text: string,
  logoWidth: 288 | 64,
) {
  await vi.waitFor(() => {
    TestBed.tick();
    const loading = loadingAnimation(root());
    expect(loading?.textContent).toContain(text);
    expect(loading?.querySelector('svg')?.getAttribute('width')).toBe(String(logoWidth));
  });
}

/**
 * The Players panel: the section that opens on click, summarised "Players · N",
 * with the status and alerts it shows beside that section.
 */
export const playersPanel = (page: HTMLElement) =>
  disclosure(page, /^Players · \d+$/)!.parentElement!;

/** The seats in the Players panel inside `root`, in seat order: the items of its list "Seat order". */
export const panelSeats = (root: HTMLElement) => [
  ...namedList(playersPanel(root), 'Seat order').querySelectorAll<HTMLElement>(':scope > li'),
];

/** The names of the players in the Players panel inside `root`, in seat order. */
export const panelSeatNames = (root: HTMLElement) =>
  panelSeats(root).map((seat) => text(seat.querySelector('.name')));

/** The seat the Players panel inside `root` marks current, whose turn it is; undefined if none. */
export const panelTurnSeat = (root: HTMLElement) =>
  panelSeats(root).find((seat) => seat.getAttribute('aria-current') === 'true');

/**
 * Where the Players panel sits beside the tabs, from the desktop layout in the
 * lobby and once the draft is closed or complete: the complementary region
 * "Players". Null if there is none.
 */
export const findPlayersBesideTabs = (page: HTMLElement) =>
  byAriaLabel(page, 'aside, [role="complementary"]', 'Players');

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

/**
 * A drafting draft of Alice (the viewer) and Bob, 6 picks each, the last 4 on
 * double turns, at `pick`, with `playerId` picking: rounds 1 and 2 are single
 * turns, Alice, Bob, Bob, Alice; then round 3 goes Alice picks 5 and 6, Bob 7
 * and 8, and round 4 Bob 9 and 10, Alice 11 and 12.
 */
export const withDoubleTurns = (pick: number, playerId: string): DraftFixture => {
  const size = { players: 2, picksPerPlayer: 6, doublePicks: 4 };
  const { round, picksBeforeTurnPasses } = currentTurn(size, pick - 1)!;
  return drafting({
    picksPerPlayer: size.picksPerPlayer,
    doublePicks: size.doublePicks,
    turn: { pick, round, playerId, picksBeforeTurnPasses },
  });
};

/** A pool card as a queue or a plan names it: by its id and name. */
export type NamedPoolCard = Pick<PoolCardView, 'id' | 'name'>;

/** A card as a queue lists it. */
export const queued = (card: NamedPoolCard): QueuedCardView => ({
  poolCardId: card.id,
  name: card.name,
});

/**
 * An empty queue, queue picking, under pause queue, with `fields` changed. A
 * lost card says nothing of what its loss did to the queue, as one lost
 * before pause queue, unless it says so.
 */
export const queueOf = (
  fields: Partial<Omit<QueueView, 'lost'>> & {
    lost?: (QueuedCardView & Partial<LostQueuedCardView>)[];
  } = {},
): QueueView => ({
  cards: [],
  stealBehavior: 'PauseQueue',
  queuePaused: false,
  ...fields,
  lost: (fields.lost ?? []).map((card) => ({ queueLoss: null, ...card })),
});

/** A pick, Alice's and the draft's first, with `fields` changed. */
export const pickOf = (fields: Partial<PickView> = {}): PickView => ({
  pick: 1,
  playerId: alice.id,
  poolCardId: '',
  ...fields,
});

/**
 * Scryfall's CDN URL of one face of a printing in `version`, filed under the
 * first two characters of its Scryfall id as the CDN files them.
 */
export const image = (version: string, id: string, face = 'front') =>
  `https://cards.scryfall.io/${version}/${face}/${id[0]}/${id[1]}/${id}.jpg`;

/** A printing's images, one entry per face, as a pool card holds them. */
export const faceImages = (scryfallId: string, faces = ['front']) =>
  faces.map((face) => ({
    small: image('small', scryfallId, face),
    normal: image('normal', scryfallId, face),
    large: image('large', scryfallId, face),
  }));

/** One face of a pool card, typed `typeLine`, with nothing else filled in. */
export const faceOf = (typeLine: string): CardFace => ({
  name: '',
  typeLine,
  oracleText: null,
  manaCost: null,
  colors: null,
  power: null,
  toughness: null,
  loyalty: null,
  defense: null,
});

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
  oracleId: `${id}-oracle`,
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

/** Horizontal cards, and two that aren't though they're split or flip: as Scryfall lays each out. */
export const fireIce = poolCardOf('fire-ice', 'Fire // Ice', {
  layout: 'split',
  typeLine: 'Instant // Instant',
});
export const room = poolCardOf('room', 'Bottomless Pool // Locker Room', {
  layout: 'split',
  typeLine: 'Enchantment — Room // Enchantment — Room',
});
export const invasion = poolCardOf('invasion', 'Invasion of Zendikar // Awakened Skyclave', {
  layout: 'transform',
  typeLine: 'Battle — Siege // Creature — Elemental',
  faces: [faceOf('Battle — Siege'), faceOf('Creature — Elemental')],
  images: faceImages('invasion-id', ['front', 'back']),
});
export const aftermath = poolCardOf('cut', 'Cut // Ribbons', {
  layout: 'split',
  typeLine: 'Sorcery // Sorcery',
  keywords: ['Aftermath'],
});
export const flipCard = poolCardOf('budoka', 'Budoka Gardener // Dokai, Weaver of Life', {
  layout: 'flip',
  typeLine: 'Creature — Human Monk // Legendary Creature — Human Monk',
});

/**
 * The avatar beside a player's name in the Players panel. An avatar is
 * decorative, so it has no name of its own: it is found by its role within
 * the list item that names the player.
 */
export const playerAvatar = (page: HTMLElement, name: string) =>
  panelSeats(page)
    .find((seat) => seat.textContent?.includes(name))
    ?.querySelector<HTMLImageElement>('[role="presentation"]');

/**
 * The accessible names, in page order, of the buttons and links in the
 * action row that holds the button or link `label` inside `root`: the
 * nearest element around it holding other buttons or links too, however
 * it is wrapped. A link such as a page's Cancel is one of the row's buttons.
 * The button-order standard makes this order behaviour.
 */
export function buttonOrder(root: HTMLElement, label: string): string[] {
  const controls = 'button, a[href]';
  const found = [...root.querySelectorAll<HTMLElement>(controls)].find(
    (control) => accessibleName(control) === label,
  );
  if (!found) throw new Error(`buttonOrder: no button or link "${label}" to find the row by`);
  let row: HTMLElement = found;
  while (row !== root && row.parentElement && row.querySelectorAll(controls).length < 2) {
    row = row.parentElement;
  }
  return [...row.querySelectorAll(controls)].map(accessibleName);
}

/** What a screen reader reads as `element`'s description: the text of the elements its aria-describedby names. */
export const accessibleDescription = (element: Element) =>
  (element.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .map((id) => text(element.ownerDocument.getElementById(id)))
    .join(' ');

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

/** The first element inside `root` whose text, as a viewer reads it, is `wanted`; null if there is none. */
export const elementWithText = (root: HTMLElement, wanted: string) =>
  [...root.querySelectorAll<HTMLElement>('*')].find((element) => text(element) === wanted) ?? null;

/**
 * Whether `element` sits in a live region, which announces its changes: it
 * or an element around it has `aria-live`, or the role status, alert or log.
 */
export const inLiveRegion = (element: Element | null): boolean =>
  !!element &&
  (element.hasAttribute('aria-live') ||
    ['status', 'alert', 'log'].includes(element.getAttribute('role') ?? '') ||
    inLiveRegion(element.parentElement));

/** A region inside `root`, such as a section, by its accessible name; null if there is none. */
export const region = (root: HTMLElement, name: string) =>
  byAriaLabel(root, 'section, [role="region"]', name);

/** Whether the toggle button inside `root` named `label` is pressed, such as a chosen mode or grouping; undefined if there is none. */
export const pressed = (root: HTMLElement, label: string) =>
  button(root, label)?.getAttribute('aria-pressed');

/**
 * A group of controls inside `root`, such as a fieldset, by its accessible
 * name: its aria-label, or else a fieldset's legend. Null if there is none.
 */
export const group = (root: HTMLElement, name: string) =>
  byAriaLabel(root, '[role="group"], fieldset', name) ??
  [...root.querySelectorAll<HTMLElement>('fieldset:not([aria-label])')].find(
    (fieldset) => text(fieldset.querySelector(':scope > legend')) === name,
  ) ??
  null;

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

/** The preview of the file chosen for a pick import inside `root`: the status headed Import picks; undefined if none shows. */
export const pickImportPreview = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>('[role="status"]')].find((status) =>
    heading(status, 'Import picks'),
  );

/** The problems listed with the file chosen for a pick import inside `root`, in order; none while no list shows. */
export const pickImportProblems = (root: HTMLElement) =>
  findNamedList(root, 'Problems with the file') ? items(root, 'Problems with the file') : [];

/** The text of every status message inside `root`, with its whitespace collapsed. */
export const statusTexts = (root: HTMLElement) =>
  [...root.querySelectorAll('[role="status"]')].map((el) => text(el));

/** A list inside `root`, by its accessible name, such as "Pick log"; null if there is none. */
export const findNamedList = (root: HTMLElement, name: string) =>
  byName(root, 'ul, ol, [role="list"]', name);

/** A list inside `root` that is there, by its accessible name, such as "Pick log" or "Your picks". */
export const namedList = (root: HTMLElement, name: string) => findNamedList(root, name)!;

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

/** The picks left count inside `root`, such as beside a panel's heading, found by its text. */
export const picksLeftCount = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>('*')].find((element) =>
    /^(– )?\d+ picks? left$/.test(element.textContent.trim()),
  );

/**
 * The picks left text highlighted inside `root`, as near the end of the
 * viewer's picks, such as "10 picks left". Null when nothing is.
 */
export const highlightedPicksLeft = (root: HTMLElement) =>
  root.querySelector('[data-highlighted="true"]')?.textContent.trim() ?? null;

/** Every picks left count that `root`'s text reads, such as "12 picks left". */
export const picksLeftTexts = (root: HTMLElement) =>
  root.textContent.match(/\d+ picks? left/g) ?? [];

/** The form controls with each role, by the selector that finds them. */
const CONTROLS = {
  textbox:
    'textarea, input:not([type]):not([role]), input[type="text"]:not([role]), input[type="url"]',
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
  collapseWhitespace(
    [...label.childNodes]
      .map((node) =>
        node.nodeType === Node.TEXT_NODE
          ? node.textContent
          : node instanceof HTMLImageElement
            ? node.alt
            : '',
      )
      .join(' '),
  );

/** Each checkbox inside `root`, in page order: ☑ or ☐, then its label's text. */
export const checkboxes = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLInputElement>(CONTROLS.checkbox)].map(
    (box) => `${box.checked ? '☑' : '☐'} ${text(box.labels?.[0])}`,
  );

/** The controls among `controls` whose label's own text is `label`. */
const labelled = <C extends HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
  controls: NodeListOf<C>,
  label: string,
) =>
  [...controls].filter((control) => [...(control.labels ?? [])].some((l) => ownText(l) === label));

/** Every form control inside `root` with this role and label, in page order. */
export const controlsByLabel = <R extends ControlRole>(root: HTMLElement, role: R, label: string) =>
  labelled(root.querySelectorAll<ControlOf[R]>(CONTROLS[role]), label);

/**
 * An editable combobox inside `root`, by its label's own text: a text field
 * with a list of options below it that narrows as the viewer types.
 */
export const editableCombobox = (root: HTMLElement, label: string) =>
  labelled(root.querySelectorAll<HTMLInputElement>('input[role="combobox"]'), label)[0];
/** The options an editable combobox's list offers, in order, by their text; none while it is closed. */
export const comboboxOptions = (field: HTMLInputElement) =>
  field.getAttribute('aria-expanded') === 'true'
    ? [
        ...(document
          .getElementById(field.getAttribute('aria-controls')!)
          ?.querySelectorAll<HTMLElement>('[role="option"]') ?? []),
      ]
    : [];
/** What the status beside an editable combobox's open list says, such as that nothing matches; null if none. */
export const comboboxStatus = (field: HTMLInputElement) => {
  const list = document.getElementById(field.getAttribute('aria-controls') ?? '');
  const status = list?.parentElement?.querySelector('[role="status"]');
  return status ? collapseWhitespace(status.textContent) : null;
};
/** The option an editable combobox highlights, by its text, if any. */
export const highlightedOption = (field: HTMLInputElement) => {
  const id = field.getAttribute('aria-activedescendant');
  return id ? collapseWhitespace(document.getElementById(id)?.textContent ?? '') : null;
};
/** Types `value` into a text field, replacing what it held, and renders what came of it. */
export function typeInto(field: HTMLInputElement | HTMLTextAreaElement, value: string) {
  field.value = value;
  field.dispatchEvent(new Event('input'));
  TestBed.tick();
}

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
 * if the draft has one, and its decklists by `decklists` if the tournament
 * shows them, signed in as `user`, whose draft powers are `powers` (as `powersAnswer` sets them: none, unless told otherwise),
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
    decklists,
    user = alice,
    powers,
    url = '/drafts/draft-1',
  }: {
    cards?: PoolCardView[];
    picks?: PickView[];
    queue?: QueueView;
    plan?: PlanView;
    tournament?: ViewerTournamentView;
    decklists?: DecklistView[];
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
    if (tournament.showsDecklists) {
      if (!decklists)
        throw new Error('A tournament with decklists shown needs `decklists` to read.');
      await flushDecklists(decklists);
    }
  }
  await fixture.whenStable();
  return { fixture, page };
}

/** Answers the page's GET of draft-1's decklists with `decklists`. */
export async function flushDecklists(decklists: DecklistView[]) {
  (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/tournament/decklists'))).flush(
    decklists,
  );
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
 * Starts the open draft-1, opened by Alice, as its start is pushed to the
 * page, as `drafting` makes it with `fields` changed, and answers the reads
 * the start brings: an empty pick log, and an empty queue and plan if Alice
 * is one of its players.
 */
export async function startDraft(fixture: AppFixture, fields: DraftFixture = {}) {
  const started = draft(drafting({ state: 'Drafting', version: 1, ...fields }));
  updates.events.next({ type: 'changed', draft: started });
  await flushPicks([]);
  if (started.players.some((player) => player.id === alice.id)) await flushQueueAndPlan();
  await fixture.whenStable();
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

/**
 * What `read` finds midway through each navigation from now on, once its
 * guards have run and before it lands, with the page rendered then; in order.
 */
export function midNavigation<T>(read: () => T): T[] {
  const seen: T[] = [];
  const watching = TestBed.inject(Router).events.subscribe((event) => {
    if (!(event instanceof GuardsCheckEnd)) return;
    TestBed.tick();
    seen.push(read());
  });
  onTestFinished(() => watching.unsubscribe());
  return seen;
}

/** The URL each navigation from now on lands on, in order. */
export function landedUrls(): string[] {
  const landed: string[] = [];
  const watching = TestBed.inject(Router).events.subscribe((event) => {
    if (event instanceof NavigationEnd) landed.push(event.urlAfterRedirects);
  });
  onTestFinished(() => watching.unsubscribe());
  return landed;
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

/** The images of the Card previews open: one at most, outside the page. */
export const previewImages = () => [
  ...document.querySelectorAll<HTMLImageElement>('app-card-preview img'),
];
/** The Card preview's image, if one is open: it's outside the page. */
export const previewImage = () => previewImages()[0] ?? null;

/** Taps the card named `card` in the list inside `root` named `list`, returning its Card preview's image URL, if one opens. */
export function previewInList(root: HTMLElement, list: string, card: string) {
  tap(cardName(namedList(root, list), card));
  return previewImage()?.getAttribute('src');
}

/**
 * Whether a card's image, or what shows while it loads, is turned 90°
 * clockwise in a box as wide as the card is tall, as a horizontal card's face
 * is shown: what the viewer sees, from the styles jsdom applies.
 */
export function shownSideways(image: Element): boolean {
  const turned = /rotate\(90deg\)/.test(getComputedStyle(image).transform);
  if (turned !== inSidewaysBox(image)) throw new Error('A card image is turned in the wrong box.');
  return turned;
}

/** Whether `element` is in a card image's box that's as wide as the card is tall. */
export function inSidewaysBox(element: Element): boolean {
  const box = element.closest('app-card-image')!;
  const [width, height] = getComputedStyle(box).aspectRatio.split('/').map(Number);
  return width > height;
}

/** Whether a card's image can be seen, rather than waiting hidden to decode, from the styles jsdom applies. */
export const visible = (image: Element) => getComputedStyle(image).opacity !== '0';

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
