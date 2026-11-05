import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Directive,
  ElementRef,
  inject,
  Injectable,
  Injector,
  input,
  signal,
} from '@angular/core';

/** A control focus can be put back on, by its key. */
interface FocusTarget {
  readonly element: HTMLElement;
  readonly key: () => string;
}

/** Where focus was when a change was sent: the keys of the controls to put it back on, in order of preference. */
type Press = string[];

/**
 * The changes one component sends, one at a time. While one is in flight
 * the controls that send one ignore presses, and are marked so. Once it
 * settles, keyboard focus is back on the control it was pressed on, found
 * by its key wherever the re-render has put it, or on the nearest control
 * still there should it be gone or disabled; and a change made can say
 * what it did, for screen readers.
 *
 * Provide one per component, mark its controls with `appSendsChange` (or
 * `appFocusKey`, for one that sends nothing), and show `app-change-status`.
 */
@Injectable()
export class Changes {
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  private readonly targets = new Set<FocusTarget>();
  private readonly inFlight = signal(false);
  private readonly said = signal('');
  /** The keys to put focus back on, or null if focus wasn't here when the change was sent. */
  private press: Press | null = null;

  /** A change is in flight: until it settles, the controls that send one ignore presses. */
  readonly changing = this.inFlight.asReadonly();
  /** What the latest change made did, for screen readers. */
  readonly status = this.said.asReadonly();

  /** Adds a control focus can be put back on, until the returned function removes it. */
  register(target: FocusTarget) {
    this.targets.add(target);
    return () => this.targets.delete(target);
  }

  /**
   * Sends the change `work` makes, unless another is in flight, and answers
   * whether it was made: `work` answers true if so. Focus is kept on the
   * control it was pressed on, or else the first of `keep` here, or else
   * the controls nearest it, those after it first. A change made says
   * `status`. Once made, a change with `busyOnceMade` leaves the controls
   * ignoring presses, as one the page leaves on.
   */
  async send(
    work: () => Promise<boolean | void>,
    {
      keep = [],
      status = '',
      busyOnceMade = false,
    }: { keep?: string[]; status?: string; busyOnceMade?: boolean } = {},
  ): Promise<boolean> {
    if (this.inFlight()) return false;
    this.press = this.pressed(keep);
    this.inFlight.set(true);
    this.said.set('');
    let made = false;
    try {
      made = (await work()) === true;
      if (made) this.said.set(status);
      return made;
    } finally {
      if (!(made && busyOnceMade)) this.inFlight.set(false);
      this.restore(true);
    }
  }

  /** Puts focus back now, as a change shows what it does before it settles, and again once it has. */
  refocus() {
    this.restore(false);
  }

  /** The controls focus can be put back on, in page order. */
  private ordered() {
    return [...this.targets].sort((a, b) =>
      a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    );
  }

  /**
   * The keys to put focus back on, from the control focused here: its own,
   * then `keep`, then the other controls' after it, then before it, nearest
   * first. Nothing, if focus is outside this component or on nothing.
   */
  private pressed(keep: string[]): Press | null {
    const focused = this.host.ownerDocument.activeElement;
    if (!(focused instanceof HTMLElement) || !this.host.contains(focused)) return null;
    const keys = this.ordered()
      .map((target) => ({ key: target.key(), here: target.element === focused }))
      .filter(({ key }) => key !== '');
    const at = keys.findIndex(({ here }) => here);
    if (at === -1) return keep;
    const key = (i: number) => keys[i].key;
    return [
      key(at),
      ...keep,
      ...keys.slice(at + 1).map(({ key }) => key),
      ...keys
        .slice(0, at)
        .reverse()
        .map(({ key }) => key),
    ];
  }

  /**
   * After the next render, puts focus on the first control of the press's
   * keys that is still here and enabled, unless the viewer has moved focus
   * elsewhere meanwhile. `settled` forgets the press, as its change is done.
   */
  private restore(settled: boolean) {
    const press = this.press;
    if (settled) this.press = null;
    if (!press) return;
    afterNextRender(
      () => {
        const focused = this.host.ownerDocument.activeElement;
        const lost = !focused || focused === this.host.ownerDocument.body;
        if (!lost && !this.host.contains(focused)) return;
        const byKey = new Map<string, HTMLElement>();
        for (const { element, key } of this.ordered()) {
          if (!(element as HTMLButtonElement).disabled && !byKey.has(key())) {
            byKey.set(key(), element);
          }
        }
        const target = press.map((key) => byKey.get(key)).find((element) => element);
        if (target && target !== focused) target.focus();
      },
      { injector: this.injector },
    );
  }
}

/**
 * A control focus can be put back on once a change settles, by its key,
 * which no other control in the component shares; one with no key isn't.
 */
@Directive({ selector: '[appFocusKey]' })
export class FocusKey {
  readonly key = input('', { alias: 'appFocusKey' });

  constructor() {
    const element: HTMLElement = inject(ElementRef).nativeElement;
    const unregister = inject(Changes).register({ element, key: this.key });
    inject(DestroyRef).onDestroy(unregister);
  }
}

/**
 * A control that sends a change, marked `aria-disabled` while one is in
 * flight; it stays focusable, so focus isn't lost. Its value is its focus
 * key, as `appFocusKey`'s.
 */
@Directive({
  selector: '[appSendsChange]',
  hostDirectives: [{ directive: FocusKey, inputs: ['appFocusKey: appSendsChange'] }],
  host: { '[attr.aria-disabled]': 'changes.changing() || null' },
})
export class SendsChange {
  protected readonly changes = inject(Changes);
}

/** Says what the component's latest change made did, for screen readers only. */
@Component({
  selector: 'app-change-status',
  template: '{{ changes.status() }}',
  host: { class: 'visually-hidden', role: 'status' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChangeStatus {
  protected readonly changes = inject(Changes);
}
