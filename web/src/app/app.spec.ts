import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';

describe('App', () => {
  let http: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting()],
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
    // The home page checks API health; answer it so the app can settle.
    TestBed.tick();
    for (const req of http.match('/api/health')) req.flush({ api: 'ok', db: 'ok' });
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

  const alice = {
    id: '80351110224678912',
    name: 'Alice',
    avatarUrl: 'https://cdn.discordapp.com/embed/avatars/5.png',
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

    const logOut = [...page.querySelectorAll('header button')].find((b) =>
      b.textContent?.includes('Log out'),
    ) as HTMLButtonElement;
    logOut.click();
    const logout = await vi.waitFor(() => http.expectOne('/api/auth/logout'));
    expect(logout.request.method).toBe('POST');
    logout.flush(null, { status: 204, statusText: 'No Content' });

    await vi.waitFor(() => expect(router.url).toBe('/sign-in'));
    expect(page.querySelector('header')?.textContent ?? '').not.toContain('Alice');
  });
});
