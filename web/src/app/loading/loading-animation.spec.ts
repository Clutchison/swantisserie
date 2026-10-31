import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LoadingAnimation } from './loading-animation';

@Component({
  imports: [LoadingAnimation],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-loading-animation size="tab">Loading the picks…</app-loading-animation>`,
})
class Host {}

describe('LoadingAnimation', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function render() {
    const fixture = TestBed.createComponent(Host);
    TestBed.tick();
    return { fixture, page: fixture.nativeElement as HTMLElement };
  }

  function wait(ms: number) {
    vi.advanceTimersByTime(ms);
    TestBed.tick();
  }

  it('shows nothing until the load has taken 200ms', () => {
    const { page } = render();

    wait(199);
    expect(page.textContent).not.toContain('Loading the picks…');
    expect(page.querySelector('svg')).toBeNull();

    wait(1);
    expect(page.textContent).toContain('Loading the picks…');
    expect(page.querySelector('svg')).not.toBeNull();
  });

  it('stops waiting when the load ends first', () => {
    const { fixture, page } = render();
    wait(100);
    fixture.destroy();

    expect(vi.getTimerCount()).toBe(0);
    expect(page.textContent).not.toContain('Loading the picks…');
  });

  it('announces the text in a status region that is there before the text is', () => {
    const { page } = render();
    const status = page.querySelector('[role="status"]');
    expect(status?.textContent?.trim()).toBe('');

    wait(200);
    expect(page.querySelector('[role="status"]')).toBe(status);
    expect(status?.textContent).toContain('Loading the picks…');
  });

  it('hides the logo from screen readers, as the text says it all', () => {
    const { page } = render();
    wait(200);

    expect(page.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  describe('motion', () => {
    function prefersReducedMotion(reduced: boolean) {
      vi.stubGlobal('matchMedia', (query: string) => ({
        matches: reduced && query === '(prefers-reduced-motion: reduce)',
      }));
    }

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('moves for viewers who have not asked for reduced motion', () => {
      prefersReducedMotion(false);
      const { page } = render();
      wait(200);

      expect(page.querySelector('svg')?.classList).toContain('moving');
    });

    it('keeps the logo still, with the text, for viewers who ask for reduced motion', () => {
      prefersReducedMotion(true);
      const { page } = render();
      wait(200);

      expect(page.querySelector('svg')?.classList).not.toContain('moving');
      expect(page.textContent).toContain('Loading the picks…');
    });
  });
});
