import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { StatusPage } from './status-page';

describe('StatusPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [StatusPage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function render(respond: (req: ReturnType<HttpTestingController['expectOne']>) => void) {
    const fixture = TestBed.createComponent(StatusPage);
    // Not whenStable(): it would wait on the very request we have yet to answer.
    TestBed.tick();
    respond(http.expectOne('/api/health'));
    await fixture.whenStable();
    return (fixture.nativeElement as HTMLElement).textContent;
  }

  it('shows API ok / DB ok when the health check passes', async () => {
    const text = await render((req) => req.flush({ api: 'ok', db: 'ok' }));

    expect(text).toContain('API ok');
    expect(text).toContain('DB ok');
  });

  it('shows API ok / DB error when the API reports the database is down', async () => {
    const text = await render((req) =>
      req.flush({ api: 'ok', db: 'error' }, { status: 503, statusText: 'Service Unavailable' }),
    );

    expect(text).toContain('API ok');
    expect(text).toContain('DB error');
  });

  it('shows API unreachable when the request fails without a health report', async () => {
    const text = await render((req) => req.error(new ProgressEvent('error')));

    expect(text).toContain('API unreachable');
  });
});
