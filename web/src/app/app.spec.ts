import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';
import { expectLoadingAnimation } from './drafts/specs/harness';
import { answerUnreviewedCount } from './feedback/specs-harness';

describe('App', () => {
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

  /** Opens `url` with /api/auth/me answered by `respond`. */
  async function open(
    url: string,
    respond: (req: ReturnType<HttpTestingController['expectOne']>) => void,
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
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('says so while the first page loads', async () => {
    const fixture = TestBed.createComponent(App);
    const navigation = router.navigateByUrl('/');
    const req = await vi.waitFor(() => http.expectOne('/api/auth/me'));
    const page = fixture.nativeElement as HTMLElement;
    await expectLoadingAnimation(() => page, 'Loading…', 288);

    req.flush({ id: '1', name: 'Alice', avatarUrl: 'https://example.com/a.png', isAdmin: false });
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
    expect(page.querySelector('.error')?.textContent).toContain('roto-draft role');
  });

  const alice = {
    id: '80351110224678912',
    name: 'Alice',
    avatarUrl: 'https://cdn.discordapp.com/embed/avatars/5.png',
    isAdmin: false,
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
    });

    it('shows an app admin the home link, Admin and Send feedback on the left, in order', async () => {
      const page = await open('/', (req) => req.flush({ ...alice, isAdmin: true }));

      expect(leftControls(page)).toEqual(['Swantisserie', 'Admin', 'Send feedback']);
    });

    it('shows other users no Admin, Webhooks or Feedback', async () => {
      const page = await open('/', (req) => req.flush(alice));

      expect(leftControls(page)).toEqual(['Swantisserie', 'Send feedback']);
      expect(page.querySelector('header a[href="/admin/webhooks"]')).toBeNull();
      expect(page.querySelector('header a[href="/admin/feedback"]')).toBeNull();
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

  describe('Admin dropdown', () => {
    async function openAdmin() {
      const page = await open('/', (req) => req.flush({ ...alice, isAdmin: true }));
      const trigger = adminButton(page);
      expect(menuLinks(page)).toEqual([]);
      trigger.click();
      TestBed.tick();
      return { page, trigger };
    }

    it('opens on click and holds Webhooks then Feedback', async () => {
      const { page, trigger } = await openAdmin();

      expect(menuLinks(page)).toEqual(['Webhooks', 'Feedback']);
      expect(trigger.getAttribute('aria-expanded')).toBe('true');
    });

    it('closes on an outside click', async () => {
      const { page } = await openAdmin();

      page.querySelector<HTMLElement>('.name')!.click();
      TestBed.tick();

      expect(menuLinks(page)).toEqual([]);
    });

    it('closes on Escape and returns focus to its button', async () => {
      const { page, trigger } = await openAdmin();

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      TestBed.tick();

      expect(menuLinks(page)).toEqual([]);
      expect(document.activeElement).toBe(trigger);
    });

    it('closes when an item is chosen, and goes there', async () => {
      const { page } = await openAdmin();

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

    it('shows other users only Send feedback', async () => {
      const page = await openMenu(alice);

      expect(panelText(page)).toEqual(['Send feedback']);
    });

    it('also shows an app admin Webhooks and Feedback under an Admin heading', async () => {
      const page = await openMenu({ ...alice, isAdmin: true });

      expect(panelText(page)).toEqual(['Send feedback', 'Admin', 'Webhooks', 'Feedback']);
      const heading = page.querySelector<HTMLElement>('.panel .menu-heading')!;
      expect(heading.textContent).toBe('Admin');
      expect(heading.closest('a, button')).toBeNull();
    });

    it('stays open when the Admin heading is clicked', async () => {
      const page = await openMenu({ ...alice, isAdmin: true });

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
      const page = await openMenu({ ...alice, isAdmin: true });

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
    expect(page.querySelector('header')?.textContent ?? '').not.toContain('Alice');
  });

  it('signs the user out locally even when the logout request fails', async () => {
    const page = await open('/', (req) => req.flush(alice));

    clickLogOut(page);
    (await vi.waitFor(() => http.expectOne('/api/auth/logout'))).error(new ProgressEvent('error'));

    await vi.waitFor(() => expect(router.url).toBe('/sign-in'));
    expect(page.querySelector('header')?.textContent ?? '').not.toContain('Alice');
  });

  it('sends signed-out users on any page to the sign-in page', async () => {
    await open('/drafts/42', (req) => req.flush(null, { status: 401, statusText: 'Unauthorized' }));

    expect(router.url).toBe('/sign-in');
  });
});

/** The visible text of the desktop left group's controls, in order. */
function leftControls(page: HTMLElement) {
  return [...page.querySelectorAll('header .left-group a, header .wide-only button')].map(
    (control) => control.textContent?.trim(),
  );
}

function adminButton(page: HTMLElement) {
  return [...page.querySelectorAll<HTMLButtonElement>('header button')].find(
    (button) => button.textContent?.trim() === 'Admin',
  )!;
}

function menuLinks(page: HTMLElement) {
  return [...page.querySelectorAll('header .panel a')].map((link) => link.textContent?.trim());
}

function panelText(page: HTMLElement) {
  return [...page.querySelectorAll('header .panel .menu-item, header .panel .menu-heading')].map(
    (item) => item.textContent?.trim(),
  );
}

function clickLogOut(page: HTMLElement) {
  const button = [...page.querySelectorAll('header button')].find((b) =>
    b.textContent?.includes('Log out'),
  ) as HTMLButtonElement;
  button.click();
}
