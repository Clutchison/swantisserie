import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';

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
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

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
    expect(header.querySelector('img')?.getAttribute('src')).toBe(alice.avatarUrl);
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

function clickLogOut(page: HTMLElement) {
  const button = [...page.querySelectorAll('header button')].find((b) =>
    b.textContent?.includes('Log out'),
  ) as HTMLButtonElement;
  button.click();
}
