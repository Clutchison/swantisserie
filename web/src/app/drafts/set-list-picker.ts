import { httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  forwardRef,
  inject,
  InjectionToken,
  input,
  signal,
  untracked,
} from '@angular/core';
import { type ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import {
  MAX_SET_LIST_SETS,
  type Platform,
  type SetCatalogView,
  type SetListEntryView,
  type SetOptionView,
} from 'contract';
import { setListText } from './drafts';

/** How often to ask again for the sets while the api is still counting their cards. */
export const SET_CATALOG_POLL_MS = new InjectionToken<number>('SET_CATALOG_POLL_MS', {
  providedIn: 'root',
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
  protected readonly loading = computed(() => this.catalog.isLoading() && !this.catalog.hasValue());
  protected readonly failed = computed(() => !!this.catalog.error());
  protected readonly counting = computed(
    () => this.catalog.hasValue() && this.catalog.value().counting,
  );
  private readonly sets = computed(() =>
    this.catalog.hasValue() ? this.catalog.value().sets : [],
  );
  protected readonly search = signal('');
  /** The sets whose code or name holds what was searched for. */
  protected readonly shown = computed(() => {
    const search = this.search().trim().toLowerCase();
    return this.sets().filter(
      (set) => set.code.includes(search) || set.name.toLowerCase().includes(search),
    );
  });
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
  protected readonly disabled = signal(false);
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
      if (!this.catalog.hasValue() || this.counting()) return;
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
      if (setListText(kept) !== setListText(chosen)) untracked(() => this.update(kept));
    });
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
    this.onTouched();
  }

  writeValue(setList: SetListEntryView[] | null): void {
    this.chosen.set(setList ?? []);
  }

  registerOnChange(onChange: (setList: SetListEntryView[]) => void): void {
    this.onChange = onChange;
  }

  registerOnTouched(onTouched: () => void): void {
    this.onTouched = onTouched;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }
}
