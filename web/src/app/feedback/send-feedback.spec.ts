import type { TestRequest } from '@angular/common/http/testing';
import type { ComponentFixture } from '@angular/core/testing';
import type { App } from '../app';
import {
  alice,
  button,
  clickBackdrop,
  dialogBackdrop,
  hiddenFromAssistiveTech,
  http,
  openApp,
  openDialog,
  pressEscape,
  pressTab,
  router,
  useApp,
} from '../specs-harness';
import { narrowMenuButton } from '../top-bar/specs-harness';
import { answerDraft42NotFound } from './specs-harness';

describe('sending feedback', () => {
  let fixture: ComponentFixture<App>;
  let page: HTMLElement;

  useApp();

  beforeEach(async () => {
    ({ fixture, page } = await openApp('/status', alice));
    // The page checks the API's health; answer it so the app can settle.
    http.expectOne('/api/health').flush({});
    await fixture.whenStable();
  });

  const dialog = openDialog;
  const field = () => dialog()!.querySelector('textarea')!;

  /** A button by its text or aria-label, in the page or the dialog open over it. */
  const anyButton = (label: string) => button(document.body, label);

  async function open() {
    anyButton('Send feedback')!.click();
    await fixture.whenStable();
    return dialog()!;
  }

  async function type(text: string) {
    field().value = text;
    field().dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  async function submit() {
    anyButton('Submit')!.click();
    await fixture.whenStable();
    return http.expectOne('/api/feedback');
  }

  function succeed(req: TestRequest) {
    req.flush(null, { status: 204, statusText: 'No Content' });
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

  it('opens a labelled dialog with one plain-text field and focuses it', async () => {
    const opened = await open();

    expect(opened.getAttribute('aria-label')).toBe('Send feedback');
    expect(opened.querySelectorAll('textarea, input')).toHaveLength(1);
    expect(field().maxLength).toBe(2000);
    await vi.waitFor(() => expect(document.activeElement).toBe(field()));
  });

  it('disables Submit while the field is empty or only whitespace', async () => {
    await open();
    expect(anyButton('Submit')!.disabled).toBe(true);

    await type(' \n ');
    expect(anyButton('Submit')!.disabled).toBe(true);

    await type('Nice app');
    expect(anyButton('Submit')!.disabled).toBe(false);
  });

  it('sends the message and the page it was sent from', async () => {
    await open();
    await type('Nice app');

    const req = await submit();

    expect(req.request.method).toBe('POST');
    expect(req.request.body.message).toBe('Nice app');
    expect(req.request.body.pagePath).toBe('/status');
    succeed(req);
  });

  it("sends the page's path, query and hash, with no scheme or host", async () => {
    const navigation = router.navigateByUrl('/drafts/42?ref=discord#x');
    await answerDraft42NotFound(http);
    await navigation;
    await fixture.whenStable();
    await open();
    await type('Nice app');

    const req = await submit();

    expect(req.request.body.pagePath).toBe('/drafts/42?ref=discord#x');
    succeed(req);
  });

  it('disables Submit while sending, so nothing is sent twice', async () => {
    await open();
    await type('Nice app');

    const req = await submit();
    expect(anyButton('Submit')!.disabled).toBe(true);
    anyButton('Submit')!.click();
    http.expectNone('/api/feedback');

    succeed(req);
    await expectThanks();
  });

  it('thanks the sender on success, with a Close button', async () => {
    await open();
    await type('Nice app');

    succeed(await submit());
    await expectThanks();

    expect(dialog()!.querySelector('textarea')).toBeNull();
    expect(anyButton('Submit')).toBeUndefined();
    await vi.waitFor(() => expect(document.activeElement).toBe(anyButton('Close')));

    anyButton('Close')!.click();
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
    expect(anyButton('Submit')!.disabled).toBe(false);

    succeed(await submit());
    await expectThanks();
  });

  describe.each<[string, () => Promise<void>]>([
    ['Cancel', async () => anyButton('Cancel')!.click()],
    ['Escape', async () => pressEscape()],
    ['a backdrop click', async () => clickBackdrop()],
  ])('closing with %s', (_, close) => {
    it('closes the dialog and discards the text', async () => {
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
    anyButton('Cancel')!.click();
    await fixture.whenStable();

    expect(req.cancelled).toBe(true);
    expect(dialog()).toBeNull();
  });

  it('stays open when a click lands inside the dialog', async () => {
    const opened = await open();

    await press(field(), 'mousedown', 'mouseup', 'click');

    expect(dialog()).toBe(opened);
  });

  it('stays open when dragging a text selection out of the field onto the backdrop', async () => {
    await open();
    await type('Nice app');

    await press(field(), 'mousedown');
    // Let go on the backdrop: however the browser aims the click, the press began in the field.
    await press(dialogBackdrop(), 'mouseup', 'click');

    expect(field().value).toBe('Nice app');
  });

  it('keeps Tab and Shift+Tab inside the dialog, wrapping at either end', async () => {
    await open();
    await vi.waitFor(() => expect(document.activeElement).toBe(field()));
    await type('Nice app');

    pressTab();
    expect(document.activeElement).toBe(anyButton('Cancel'));
    pressTab();
    expect(document.activeElement).toBe(anyButton('Submit'));
    pressTab();
    expect(document.activeElement).toBe(field());

    pressTab({ shift: true });
    expect(document.activeElement).toBe(anyButton('Submit'));
  });

  it('hides the page behind the dialog from assistive technology while it is open', async () => {
    const opener = anyButton('Send feedback')!;
    const opened = await open();

    await vi.waitFor(() => expect(hiddenFromAssistiveTech(opener)).toBe(true));
    expect(hiddenFromAssistiveTech(opened)).toBe(false);

    anyButton('Cancel')!.click();
    await fixture.whenStable();
    expect(hiddenFromAssistiveTech(opener)).toBe(false);
  });

  it.each<[string, () => void]>([
    ['Cancel', () => anyButton('Cancel')!.click()],
    ['Escape', pressEscape],
    ['a backdrop click', clickBackdrop],
  ])('returns focus to the button that opened it, on %s', async (_, close) => {
    const opener = anyButton('Send feedback')!;
    opener.focus();
    await open();
    await vi.waitFor(() => expect(document.activeElement).toBe(field()));

    close();
    await fixture.whenStable();

    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('returns focus to the menu button when opened from the narrow menu, whose item is gone', async () => {
    const menu = narrowMenuButton(page);
    menu.click();
    await fixture.whenStable();
    const item = anyButton('Send feedback')!;
    expect(menu.parentElement!.contains(item)).toBe(true);
    item.focus();
    item.click();
    await fixture.whenStable();
    await vi.waitFor(() => expect(document.activeElement).toBe(field()));
    expect(item.isConnected).toBe(false);

    anyButton('Cancel')!.click();
    await fixture.whenStable();

    expect(document.activeElement).toBe(menu);
  });
});
