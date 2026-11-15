import { HttpErrorResponse, httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  forwardRef,
  inject,
  InjectionToken,
  input,
  linkedSignal,
  signal,
  untracked,
} from '@angular/core';
import { type ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import {
  MAX_SET_LIST_SETS,
  type Platform,
  type SetCatalogProblem,
  type SetCatalogView,
  type SetListEntryView,
  type SetOptionView,
} from 'contract';
import { setListText } from './drafts';
import { setsMatching } from './set-search';
import { ToggleButton } from '../toggle-button';

// Stryker disable next-line StringLiteral: `InjectionToken` treats a falsy `providedIn` as 'root'.
const PROVIDED_IN = 'root';
/** How often to ask again for the sets while the api is still counting their cards. */
export const SET_CATALOG_POLL_MS = new InjectionToken<number>('SET_CATALOG_POLL_MS', {
  providedIn: PROVIDED_IN,
  factory: () => 3000,
});

/**
 * Chooses a set list: main sets from those on the platform, each with the
 * sublists it includes. Its form value is the set list, in the order the
 * sets were chosen; the api puts them oldest first.
 */
@Component({
  selector: 'app-set-list-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './set-list-picker.html',
  styleUrl: './set-list-picker.scss',
  imports: [ToggleButton],
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SetListPicker), multi: true },
  ],
})
export class SetListPicker implements ControlValueAccessor {
  readonly platform = input.required<Platform>();

  private readonly pollMs = inject(SET_CATALOG_POLL_MS);
  private readonly catalog = httpResource<SetCatalogView>(() => ({
    url: '/api/sets',
    params: { platform: this.platform() },
  }));
  /**
   * The last catalog read on the platform, kept through a failed read, and
   * the read's failure since then, if any; a platform switch starts afresh.
   */
  private readonly read = linkedSignal<CatalogAnswer, CatalogRead>({
    source: () => ({
      platform: this.platform(),
      catalog: this.catalog.hasValue() ? this.catalog.value() : undefined,
      // The resource keeps a failed read's error while it asks again: that is asking, not failing.
      error: this.catalog.isLoading() ? undefined : this.catalog.error(),
    }),
    computation: (answer, previous) => {
      if (answer.catalog) return { catalog: answer.catalog };
      const kept: CatalogRead = previous?.source.platform === answer.platform ? previous.value : {};
      if (answer.error) return { catalog: kept.catalog, failure: answer.error };
      // Asking again: a re-read keeps its failure on show until it is answered.
      return kept.catalog ? kept : {};
    },
  });
  protected readonly loading = computed(() => !this.read().catalog && !this.read().failure);
  /** Why the first read failed, while no catalog has been read. */
  protected readonly loadFailure = computed(() => {
    const { catalog, failure } = this.read();
    return !catalog && failure ? failureText(failure, 'Couldn’t load the sets') : null;
  });
  /** Why asking again failed, while the last catalog read stays on show. */
  protected readonly rereadFailure = computed(() => {
    const { catalog, failure } = this.read();
    return catalog && failure ? rereadText(failure) : null;
  });
  protected readonly counting = computed(() => !!this.read().catalog?.counting);
  private readonly sets = computed(
    () =>
      // Stryker disable next-line ArrayDeclaration: read only while the sets load or have failed, when the template shows neither list and no chosen code matches.
      this.read().catalog?.sets ?? [],
  );
  protected readonly search = signal('');
  /** The sets whose code or name holds what was searched for. */
  protected readonly shown = computed(() => setsMatching(this.sets(), this.search()));
  // Stryker disable next-line ArrayDeclaration: forms call `writeValue([])` on setup, which replaces it.
  protected readonly chosen = signal<SetListEntryView[]>([]);
  protected readonly chosenText = computed(() => setListText(this.chosen()));
  /** Each chosen set that has sublists, with what the picker offers of it. */
  protected readonly chosenWithSublists = computed(() => {
    const offered = new Map(this.sets().map((set) => [set.code, set]));
    return this.chosen()
      .map((entry) => ({ entry, set: offered.get(entry.code) }))
      .filter(
        (chosen): chosen is { entry: SetListEntryView; set: SetOptionView } =>
          !!chosen.set && chosen.set.sublists.length > 0,
      );
  });
  protected readonly maxSets = MAX_SET_LIST_SETS;
  /** As many sets are chosen as a set list can hold, as the api checks. */
  protected readonly full = computed(() => this.chosen().length >= MAX_SET_LIST_SETS);

  private onChange: (setList: SetListEntryView[]) => void = () => {};
  private onTouched: () => void = () => {};

  constructor() {
    // Asks again while the api is still counting, once each answer is in.
    effect((onCleanup) => {
      if (!this.counting() || this.catalog.isLoading()) return;
      const timer = setTimeout(() => this.catalog.reload(), this.pollMs);
      onCleanup(() => clearTimeout(timer));
    });
    // Once every set on the platform is counted, drops chosen sets and
    // sublists it doesn't offer, as after switching platforms.
    effect(() => {
      if (!this.catalog.hasValue() || this.catalog.value().counting) return;
      const offered = new Map(this.sets().map((set) => [set.code, set]));
      const chosen = untracked(this.chosen);
      const kept = chosen
        .filter((entry) => offered.has(entry.code))
        .map((entry) => ({
          code: entry.code,
          sublists: entry.sublists.filter((code) =>
            offered.get(entry.code)!.sublists.some((sublist) => sublist.code === code),
          ),
        }));
      // Stryker disable next-line ConditionalExpression: updating anyway sets what `chosen` already holds, and nothing reads the control's dirty or touched state.
      if (setListText(kept) !== setListText(chosen)) untracked(() => this.update(kept));
    });
  }

  /** Asks again for the sets after the first read failed. */
  protected tryAgain(): void {
    this.catalog.reload();
  }

  protected isChosen(code: string): boolean {
    return this.chosen().some((entry) => entry.code === code);
  }

  protected toggleSet(set: SetOptionView): void {
    this.update(
      this.isChosen(set.code)
        ? this.chosen().filter((entry) => entry.code !== set.code)
        : [
            ...this.chosen(),
            {
              code: set.code,
              sublists: set.sublists
                .filter((sublist) => sublist.includedByDefault)
                .map((sublist) => sublist.code),
            },
          ],
    );
  }

  /** Includes or leaves out the sublist, keeping the set's sublists in the picker's order. */
  protected toggleSublist(set: SetOptionView, code: string): void {
    this.update(
      this.chosen().map((entry) => {
        if (entry.code !== set.code) return entry;
        const included = new Set(entry.sublists);
        if (included.has(code)) included.delete(code);
        else included.add(code);
        return {
          code: entry.code,
          sublists: set.sublists.map((s) => s.code).filter((c) => included.has(c)),
        };
      }),
    );
  }

  protected searchFor(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  private update(setList: SetListEntryView[]): void {
    this.chosen.set(setList);
    this.onChange(setList);
    // Stryker disable next-line CallExpression: no validator or template reads touched.
    this.onTouched();
  }

  /** The form writes only its initial `[]`: it never resets or patches the control. */
  // Stryker disable next-line BlockStatement: `[]` is what `chosen` already holds.
  writeValue(setList: SetListEntryView[]): void {
    // Stryker disable next-line CallExpression: `[]` is what `chosen` already holds.
    this.chosen.set(setList);
  }

  registerOnChange(onChange: (setList: SetListEntryView[]) => void): void {
    this.onChange = onChange;
  }

  // Stryker disable next-line BlockStatement: no validator or template reads touched.
  registerOnTouched(onTouched: () => void): void {
    this.onTouched = onTouched;
  }
}

/** What a read of the sets answered: its catalog, or its failure. */
interface CatalogAnswer {
  platform: Platform;
  catalog: SetCatalogView | undefined;
  error: Error | undefined;
}

/** The last catalog read on the platform and the failure of a read since, if any. */
interface CatalogRead {
  catalog?: SetCatalogView;
  failure?: Error;
}

/** Whether the api said Scryfall failed, the only cause the picker can name. */
function scryfallFailed(failure: Error): boolean {
  return (
    failure instanceof HttpErrorResponse &&
    (failure.error as Partial<SetCatalogProblem> | null)?.error === 'scryfall-unavailable'
  );
}

function failureText(failure: Error, text: string): string {
  return scryfallFailed(failure) ? `${text} from Scryfall.` : `${text}.`;
}

function rereadText(failure: Error): string {
  return scryfallFailed(failure)
    ? 'Couldn’t check Scryfall for more sets; asking again.'
    : 'Couldn’t check for more sets; asking again.';
}
