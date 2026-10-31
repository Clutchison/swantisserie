import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { App } from '../app';
import { routes } from '../app.routes';

const alice = {
  id: '80351110224678912',
  name: 'Alice',
  avatarUrl: 'https://cdn.discordapp.com/embed/avatars/5.png',
  isAdmin: false,
};

describe('sending feedback', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<App>;
  let page: HTMLElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes, withComponentInputBinding()),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(App);
    page = fixture.nativeElement as HTMLElement;
    const navigation = TestBed.inject(Router).navigateByUrl('/status');
    (await vi.waitFor(() => http.expectOne('/api/auth/me'))).flush(alice);
    await navigation;
    // The page checks the API's health; answer it so the app can settle.
    TestBed.tick();
    http.expectOne('/api/health').flush({});
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  const dialog = () => page.querySelector<HTMLElement>('[role="dialog"]');
  const field = () => dialog()!.querySelector('textarea')!;

  function button(label: string) {
    return [...page.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
  }

  async function open() {
    button('Send feedback')!.click();
    await fixture.whenStable();
    return dialog()!;
  }

  async function type(text: string) {
    field().value = text;
    field().dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  async function submit() {
    button('Submit')!.click();
    await fixture.whenStable();
    return http.expectOne('/api/feedback');
  }

  /** The response arrives a moment after it is flushed. */
  async function expectThanks() {
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(dialog()!.textContent).toContain('Thanks, your feedback was sent');
    });
  }

  async function press(on: Element, ...events: string[]) {
    for (const event of events) on.dispatchEvent(new MouseEvent(event, { bubbles: true }));
    await fixture.whenStable();
  }

  it('opens a labelled modal with one plain-text field and focuses it', async () => {
    const modal = await open();

    expect(modal.getAttribute('aria-label')).toBe('Send feedback');
    expect(modal.querySelectorAll('textarea, input')).toHaveLength(1);
    expect(field().maxLength).toBe(2000);
    await vi.waitFor(() => expect(document.activeElement).toBe(field()));
  });

  it('disables Submit while the field is empty or only whitespace', async () => {
    await open();
    expect(button('Submit')!.disabled).toBe(true);

    await type(' \n ');
    expect(button('Submit')!.disabled).toBe(true);

    await type('Nice app');
    expect(button('Submit')!.disabled).toBe(false);
  });

  it('sends the message and the page it was sent from', async () => {
    await open();
    await type('Nice app');

    const req = await submit();

    expect(req.request.method).toBe('POST');
    expect(req.request.body.message).toBe('Nice app');
    expect(new URL(req.request.body.pageUrl).pathname).toBe('/status');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('disables Submit while sending, so nothing is sent twice', async () => {
    await open();
    await type('Nice app');

    const req = await submit();
    expect(button('Submit')!.disabled).toBe(true);
    button('Submit')!.click();
    http.expectNone('/api/feedback');

    req.flush(null, { status: 204, statusText: 'No Content' });
    await expectThanks();
  });

  it('thanks the sender on success, with a Close button', async () => {
    await open();
    await type('Nice app');

    (await submit()).flush(null, { status: 204, statusText: 'No Content' });
    await expectThanks();

    expect(dialog()!.querySelector('textarea')).toBeNull();
    expect(button('Submit')).toBeUndefined();
    await vi.waitFor(() => expect(document.activeElement).toBe(button('Close')));

    button('Close')!.click();
    await fixture.whenStable();
    expect(dialog()).toBeNull();
  });

  it('stays open with the text intact and an inline error on failure, and can retry', async () => {
    await open();
    await type('Nice app');

    (await submit()).flush(null, { status: 500, statusText: 'Server Error' });
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(dialog()!.querySelector('[role="alert"]')?.textContent).toContain(
        "Couldn't send your feedback.",
      );
    });

    expect(field().value).toBe('Nice app');
    expect(button('Submit')!.disabled).toBe(false);

    (await submit()).flush(null, { status: 204, statusText: 'No Content' });
    await expectThanks();
  });

  describe.each<[string, () => Promise<void>]>([
    ['Cancel', async () => button('Cancel')!.click()],
    [
      'Escape',
      async () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      },
    ],
    ['a backdrop click', () => press(dialog()!.parentElement!, 'mousedown', 'mouseup', 'click')],
  ])('closing with %s', (_, close) => {
    it('closes the modal and discards the text', async () => {
      await open();
      await type('Nice app');

      await close();
      await fixture.whenStable();
      expect(dialog()).toBeNull();

      await open();
      expect(field().value).toBe('');
    });
  });

  it('cancels the request when closed while sending', async () => {
    await open();
    await type('Nice app');

    const req = await submit();
    button('Cancel')!.click();
    await fixture.whenStable();

    expect(req.cancelled).toBe(true);
    expect(dialog()).toBeNull();
  });

  it('stays open when a click lands inside the modal', async () => {
    const modal = await open();

    await press(field(), 'mousedown', 'mouseup', 'click');

    expect(dialog()).toBe(modal);
  });

  it('stays open when dragging a text selection out of the field onto the backdrop', async () => {
    await open();
    await type('Nice app');

    await press(field(), 'mousedown');
    // A click spanning two elements fires on their common ancestor: here, the backdrop.
    await press(dialog()!.parentElement!, 'mouseup', 'click');

    expect(field().value).toBe('Nice app');
  });
});
