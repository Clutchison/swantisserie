import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationStart, provideRouter, Router, withComponentInputBinding } from '@angular/router';
import type { UserView } from 'contract';
import { App } from './app';
import { routes } from './app.routes';
import { signOutWhenSessionEnds } from './auth/sign-out-when-session-ends';
import { banner, button, expectLoadingAnimation, expectSignedOut } from './drafts/specs/harness';
import { answerUnreviewedCount } from './feedback/specs-harness';
import { appAdminButton, answerAppVersion } from './top-bar/specs-harness';

describe('App', () => {
  let http: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes, withComponentInputBinding()),
        provideHttpClient(withInterceptors([signOutWhenSessionEnds])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => http.verify());

  const sha = '0123456789abcdef0123456789abcdef01234567';
  const commitUrl = `https://github.com/Clutchison/swantisserie/commit/${sha}`;

  /**
   * Opens `url` with /api/auth/me answered by `respond`, and an app admin's
   * request for the app version by `appVersion`, unless left unanswered.
   */
  async function open(
    url: string,
    respond: (req: ReturnType<HttpTestingController['expectOne']>) => void,
    appVersion: Parameters<typeof answerAppVersion>[1] | 'unanswered' = { commit: sha },
  ) {
    const fixture = TestBed.createComponent(App);
    const navigation = router.navigateByUrl(url);
    // The guard asks asynchronously, once navigation has started.
    respond(await vi.waitFor(() => http.expectOne('/api/auth/me')));
    await navigation;
    // The home page lists drafts; answer it so the app can settle.
    TestBed.tick();
    for (const req of http.match('/api/drafts')) req.flush([]);
    answerUnreviewedCount(http);
    if (appVersion !== 'unanswered') answerAppVersion(http, appVersion);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('says so while the first page loads', async () => {
    const fixture = TestBed.createComponent(App);
    const navigation = router.navigateByUrl('/');
    const req = await vi.waitFor(() => http.expectOne('/api/auth/me'));
    const page = fixture.nativeElement as HTMLElement;
    await expectLoadingAnimation(() => page, 'Loading…', 288);

    const user: UserView = {
      id: '1',
      name: 'Alice',
      avatarUrl: 'https://example.com/a.png',
      isAppAdmin: false,
    };
    req.flush(user);
    await navigation;
    TestBed.tick();
    for (const drafts of http.match('/api/drafts')) drafts.flush([]);
    await fixture.whenStable();
    expect(page.textContent).not.toContain('Loading…');
  });

  it('says so when a page cannot be loaded, rather than staying blank', async () => {
    const fixture = TestBed.createComponent(App);
    const navigation = router.navigateByUrl('/');
    (await vi.waitFor(() => http.expectOne('/api/auth/me'))).flush(null, {
      status: 500,
      statusText: 'Server Error',
    });
    await navigation.catch(() => undefined);
    await fixture.whenStable();

    const page = fixture.nativeElement as HTMLElement;
    expect(page.querySelector('.error')?.textContent).toContain("Couldn't load this page.");
  });

  it('sends signed-out users to the sign-in page', async () => {
    const page = await open('/', (req) =>
      req.flush(null, { status: 401, statusText: 'Unauthorized' }),
    );

    expect(router.url).toBe('/sign-in');
    const signIn = page.querySelector<HTMLAnchorElement>('a[href="/api/auth/discord"]');
    expect(signIn?.textContent).toContain('Sign in with Discord');
  });

  it('tells users turned away at sign-in why', async () => {
    const fixture = TestBed.createComponent(App);
    await router.navigateByUrl('/sign-in?error=not-allowed');
    await fixture.whenStable();

    const page = fixture.nativeElement as HTMLElement;
    expect(page.querySelector('.error')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Swantisserie is only for members of our Discord server. Join the server, then sign in again.',
    );
  });

  const alice: UserView = {
    id: '80351110224678912',
    name: 'Alice',
    avatarUrl: 'https://cdn.discordapp.com/embed/avatars/5.png',
    isAppAdmin: false,
  };

  it('shows the signed-in user’s avatar and name in the header', async () => {
    const page = await open('/', (req) => req.flush(alice));

    expect(router.url).toBe('/');
    const header = page.querySelector('header')!;
    expect(header.textContent).toContain('Alice');
    expect(header.querySelector('.avatar')?.getAttribute('src')).toBe(alice.avatarUrl);
  });

  describe('desktop top bar', () => {
    it('links the logo and title to the home page as one link', async () => {
      const page = await open('/', (req) => req.flush(alice));

      const logo = page.querySelector<HTMLImageElement>('header img[src="logo.svg"]');
      const link = logo?.closest('a');
      expect(link?.getAttribute('href')).toBe('/');
      expect(link?.textContent?.trim()).toBe('Swantisserie');
      // The title is hidden on phones, where the link still needs a name.
      expect(link?.getAttribute('aria-label')).toBe('Swantisserie');
    });

    it('shows an app admin the home link, App admin and Send feedback on the left, in order', async () => {
      const page = await open('/', (req) => req.flush({ ...alice, isAppAdmin: true }));

      expect(leftControls(page)).toEqual(['Swantisserie', 'App admin', 'Send feedback']);
    });

    it('shows guild members who aren’t app admins no App admin, Webhooks or Feedback', async () => {
      const page = await open('/', (req) => req.flush(alice), 'unanswered');

      expect(leftControls(page)).toEqual(['Swantisserie', 'Send feedback']);
      expect(page.querySelector('header a[href="/admin/webhooks"]')).toBeNull();
      expect(page.querySelector('header a[href="/admin/feedback"]')).toBeNull();
      expect(page.querySelector('header')!.textContent).not.toContain('App version');
      // Nor do they ask which version is live.
      expect(http.match('/api/admin/app-version')).toEqual([]);
    });

    it('shows the username, user image and Log out on the right, in order', async () => {
      const page = await open('/', (req) => req.flush(alice));

      const right = [...page.querySelector('header .right-group')!.children];
      expect(right.map((el) => el.textContent?.trim() || el.tagName)).toEqual([
        'Alice',
        'IMG',
        'Log out',
      ]);
    });
  });

  describe('App admin dropdown', () => {
    async function openAppAdmin(appVersion?: Parameters<typeof answerAppVersion>[1]) {
      const page = await open('/', (req) => req.flush({ ...alice, isAppAdmin: true }), appVersion);
      const trigger = appAdminButton(page);
      expect(menuLinks(page)).toEqual([]);
      trigger.click();
      TestBed.tick();
      return { page, trigger };
    }

    it('opens on click and holds Webhooks, Feedback, then the app version', async () => {
      const { page, trigger } = await openAppAdmin();

      expect(menuText(page)).toEqual(['Webhooks', 'Feedback', 'App version 0123456']);
      expect(trigger.getAttribute('aria-expanded')).toBe('true');
    });

    it('links the app version to its commit on GitHub', async () => {
      const { page } = await openAppAdmin({ commit: sha });

      expect(versionLink(page)?.getAttribute('href')).toBe(commitUrl);
    });

    it('shows an unknown app version, with no link', async () => {
      const { page } = await openAppAdmin({ commit: null });

      expect(menuText(page)).toEqual(['Webhooks', 'Feedback', 'App version unknown']);
      expect(versionLink(page)).toBeNull();
    });

    it('still works, without the version, when the app version can’t be fetched', async () => {
      const { page } = await openAppAdmin('fails');

      expect(menuText(page)).toEqual(['Webhooks', 'Feedback']);
    });

    it('closes on an outside click', async () => {
      const { page } = await openAppAdmin();

      page.querySelector<HTMLElement>('.name')!.click();
      TestBed.tick();

      expect(menuLinks(page)).toEqual([]);
    });

    it('closes on Escape and returns focus to its button', async () => {
      const { page, trigger } = await openAppAdmin();

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      TestBed.tick();

      expect(menuLinks(page)).toEqual([]);
      expect(document.activeElement).toBe(trigger);
    });

    it('closes when an item is chosen, and goes there', async () => {
      const { page } = await openAppAdmin();

      page.querySelector<HTMLElement>('.panel a[href="/admin/webhooks"]')!.click();
      (await vi.waitFor(() => http.expectOne('/api/admin/webhooks'))).flush([]);

      await vi.waitFor(() => expect(router.url).toBe('/admin/webhooks'));
      TestBed.tick();
      expect(menuLinks(page)).toEqual([]);
    });
  });

  describe('hamburger menu', () => {
    async function openMenu(user: typeof alice) {
      const page = await open('/', (req) => req.flush(user));
      page.querySelector<HTMLElement>('button[aria-label="Menu"]')!.click();
      TestBed.tick();
      return page;
    }

    it('comes before the logo in the bar', async () => {
      const page = await open('/', (req) => req.flush(alice));

      const left = page.querySelector('header .left-group')!;
      expect(left.children[0].querySelector('button')?.getAttribute('aria-label')).toBe('Menu');
      expect(left.children[1].getAttribute('href')).toBe('/');
    });

    it('shows guild members who aren’t app admins only Send feedback', async () => {
      const page = await openMenu(alice);

      expect(panelText(page)).toEqual(['Send feedback']);
    });

    it('also shows an app admin Webhooks, Feedback and the app version under an App admin heading', async () => {
      const page = await openMenu({ ...alice, isAppAdmin: true });

      expect(panelText(page)).toEqual([
        'Send feedback',
        'App admin',
        'Webhooks',
        'Feedback',
        'App version 0123456',
      ]);
      expect(versionLink(page)?.getAttribute('href')).toBe(commitUrl);
      const heading = page.querySelector<HTMLElement>('.panel .menu-heading')!;
      expect(heading.textContent).toBe('App admin');
      expect(heading.closest('a, button')).toBeNull();
    });

    it('shows an app admin an unknown app version, with no link', async () => {
      const page = await open('/', (req) => req.flush({ ...alice, isAppAdmin: true }), {
        commit: null,
      });
      page.querySelector<HTMLElement>('button[aria-label="Menu"]')!.click();
      TestBed.tick();

      expect(panelText(page).at(-1)).toBe('App version unknown');
      expect(versionLink(page)).toBeNull();
    });

    it('stays open when the App admin heading is clicked', async () => {
      const page = await openMenu({ ...alice, isAppAdmin: true });

      page.querySelector<HTMLElement>('.panel .menu-heading')!.click();
      TestBed.tick();

      expect(page.querySelector('.panel')).not.toBeNull();
    });

    it('closes on an outside click', async () => {
      const page = await openMenu(alice);

      page.querySelector<HTMLElement>('.name')!.click();
      TestBed.tick();

      expect(page.querySelector('.panel')).toBeNull();
    });

    it('closes on Escape', async () => {
      const page = await openMenu(alice);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      TestBed.tick();

      expect(page.querySelector('.panel')).toBeNull();
    });

    it('closes when a link is chosen, and goes there', async () => {
      const page = await openMenu({ ...alice, isAppAdmin: true });

      page.querySelector<HTMLElement>('.panel a[href="/admin/webhooks"]')!.click();
      (await vi.waitFor(() => http.expectOne('/api/admin/webhooks'))).flush([]);

      await vi.waitFor(() => expect(router.url).toBe('/admin/webhooks'));
      TestBed.tick();
      expect(page.querySelector('.panel')).toBeNull();
    });

    it('closes, then opens the feedback dialog, when Send feedback is chosen', async () => {
      const page = await openMenu(alice);

      page.querySelector<HTMLElement>('.panel button')!.click();
      TestBed.tick();

      expect(page.querySelector('.panel')).toBeNull();
      expect(page.querySelector('[role="dialog"]')).not.toBeNull();
    });
  });

  it('logs out and returns to the sign-in page', async () => {
    const page = await open('/', (req) => req.flush(alice));

    clickLogOut(page);
    const logout = await vi.waitFor(() => http.expectOne('/api/auth/logout'));
    expect(logout.request.method).toBe('POST');
    logout.flush(null, { status: 204, statusText: 'No Content' });

    await vi.waitFor(() => expect(router.url).toBe('/sign-in'));
    expect(banner(page)?.textContent ?? '').not.toContain('Alice');
  });

  it('signs the user out locally even when the logout request fails', async () => {
    const page = await open('/', (req) => req.flush(alice));

    clickLogOut(page);
    (await vi.waitFor(() => http.expectOne('/api/auth/logout'))).error(new ProgressEvent('error'));

    await vi.waitFor(() => expect(router.url).toBe('/sign-in'));
    expect(banner(page)?.textContent ?? '').not.toContain('Alice');
  });

  it('goes to sign-in once when the logout request finds the session already gone', async () => {
    const page = await open('/', (req) => req.flush(alice));
    const toSignIn = countNavigationsToSignIn();

    clickLogOut(page);
    (await vi.waitFor(() => http.expectOne('/api/auth/logout'))).flush(null, {
      status: 401,
      statusText: 'Unauthorized',
    });

    await vi.waitFor(() => expect(router.url).toBe('/sign-in'));
    await TestBed.inject(ApplicationRef).whenStable();
    expect(toSignIn()).toBe(1);
  });

  /** Counts the navigations to sign-in from now on. */
  function countNavigationsToSignIn() {
    let count = 0;
    const counting = router.events.subscribe((event) => {
      if (event instanceof NavigationStart && event.url === '/sign-in') count++;
    });
    onTestFinished(() => counting.unsubscribe());
    return () => count;
  }

  describe('when the session ends mid-visit', () => {
    /** Opens the draft list as Alice, leaving its request for the drafts to the test. */
    async function openDraftList() {
      const fixture = TestBed.createComponent(App);
      const navigation = router.navigateByUrl('/');
      (await vi.waitFor(() => http.expectOne('/api/auth/me'))).flush(alice);
      await navigation;
      TestBed.tick();
      const page = fixture.nativeElement as HTMLElement;
      expect(banner(page)?.textContent).toContain('Alice');
      return { fixture, page, drafts: http.expectOne('/api/drafts') };
    }

    it('signs the viewer out and sends them to sign-in when a request is refused as unauthorized', async () => {
      const { fixture, drafts } = await openDraftList();

      drafts.flush(null, { status: 401, statusText: 'Unauthorized' });

      await expectSignedOut(fixture, { router, http, user: alice });
    });

    it('goes to sign-in once when several requests are refused together', async () => {
      const fixture = TestBed.createComponent(App);
      const navigation = router.navigateByUrl('/');
      (await vi.waitFor(() => http.expectOne('/api/auth/me'))).flush({
        ...alice,
        isAppAdmin: true,
      });
      await navigation;
      TestBed.tick();
      const toSignIn = countNavigationsToSignIn();

      const unauthorized = { status: 401, statusText: 'Unauthorized' };
      http.expectOne('/api/drafts').flush(null, unauthorized);
      http.expectOne('/api/admin/feedback/unreviewed-count').flush(null, unauthorized);
      for (const req of http.match('/api/admin/app-version')) req.flush(null, unauthorized);

      await vi.waitFor(() => expect(router.url).toBe('/sign-in'));
      await fixture.whenStable();
      expect(toSignIn()).toBe(1);
    });

    it('keeps the page’s own error when a request fails for another reason', async () => {
      const { fixture, page, drafts } = await openDraftList();

      drafts.flush(null, { status: 500, statusText: 'Server Error' });
      await fixture.whenStable();

      expect(router.url).toBe('/');
      expect(page.textContent).toContain("Couldn't load the drafts.");
      expect(banner(page)?.textContent).toContain('Alice');
    });
  });

  it('sends signed-out users on any page to the sign-in page', async () => {
    await open('/drafts/42', (req) => req.flush(null, { status: 401, statusText: 'Unauthorized' }));

    expect(router.url).toBe('/sign-in');
  });

  describe('status page', () => {
    type Answer = (req: ReturnType<HttpTestingController['expectOne']>) => void;
    const serverError: Answer = (req) =>
      req.flush(null, { status: 500, statusText: 'Server Error' });

    /** Opens /status with /api/auth/me answered by `me` and /api/health by `health`. */
    async function openStatus(me: Answer, health: Answer) {
      const fixture = TestBed.createComponent(App);
      const navigation = router.navigateByUrl('/status');
      me(await vi.waitFor(() => http.expectOne('/api/auth/me')));
      await navigation.catch(() => undefined);
      // Not whenStable() yet: it would wait on the health check we have yet to answer.
      TestBed.tick();
      health(await vi.waitFor(() => http.expectOne('/api/health')));
      answerUnreviewedCount(http);
      answerAppVersion(http, { commit: sha });
      await fixture.whenStable();
      return fixture.nativeElement as HTMLElement;
    }

    it('says the API is unreachable when it can’t tell who is signed in', async () => {
      const page = await openStatus(serverError, (req) => req.error(new ProgressEvent('error')));

      expect(router.url).toBe('/status');
      expect(page.textContent).toContain('API unreachable');
      expect(page.textContent).not.toContain("Couldn't load this page.");
    });

    it('says the database is down when the API reports it, even when it can’t tell who is signed in', async () => {
      const page = await openStatus(serverError, (req) =>
        req.flush({ api: 'ok', db: 'error' }, { status: 503, statusText: 'Service Unavailable' }),
      );

      expect(page.textContent).toContain('DB error');
    });

    it('opens for signed-out visitors, without sending them to sign in', async () => {
      const page = await openStatus(
        (req) => req.flush(null, { status: 401, statusText: 'Unauthorized' }),
        (req) => req.flush({ api: 'ok', db: 'ok' }),
      );

      expect(router.url).toBe('/status');
      expect(page.textContent).toContain('API ok');
      expect(page.textContent).toContain('DB ok');
      expect(logOutButton(page)).toBeUndefined();
    });

    it('shows signed-in users the header', async () => {
      const page = await openStatus(
        (req) => req.flush(alice),
        (req) => req.flush({ api: 'ok', db: 'ok' }),
      );

      expect(page.textContent).toContain('API ok');
      expect(logOutButton(page)).toBeDefined();
    });
  });
});

/** The visible text of the desktop left group's controls, in order. */
function leftControls(page: HTMLElement) {
  return [...page.querySelectorAll('header .left-group a, header .wide-only button')].map(
    (control) => control.textContent?.trim(),
  );
}

function menuLinks(page: HTMLElement) {
  return [...page.querySelectorAll('header .panel a')].map((link) => link.textContent?.trim());
}

/** The open App admin dropdown's items, in order: its links, and lines that aren't links. */
function menuText(page: HTMLElement) {
  return [...page.querySelectorAll('header .panel .menu-item, header .panel .menu-note')].map(
    (item) => item.textContent?.trim(),
  );
}

function panelText(page: HTMLElement) {
  return [
    ...page.querySelectorAll(
      'header .panel .menu-item, header .panel .menu-heading, header .panel .menu-note',
    ),
  ].map((item) => item.textContent?.trim());
}

function versionLink(page: HTMLElement) {
  return page.querySelector<HTMLAnchorElement>('header .panel a[href*="/commit/"]');
}

function logOutButton(page: HTMLElement) {
  return button(page, 'Log out');
}

function clickLogOut(page: HTMLElement) {
  logOutButton(page)!.click();
}
