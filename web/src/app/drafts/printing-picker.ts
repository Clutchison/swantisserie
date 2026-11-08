import { DialogRef } from '@angular/cdk/dialog';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  type OnInit,
  PendingTasks,
  signal,
} from '@angular/core';
import type {
  BasicLand,
  BasicLandPrintingSetView,
  BasicLandPrintingView,
  PreferredPrintingProblem,
  PreferredPrintings,
} from 'contract';
import { firstValueFrom, type Observable } from 'rxjs';
import { BasicLandPrintings } from './basic-land-printings';
import { basicCard } from './basic-lands';
import { LARGE_IMAGE } from './card-sizes';
import { DraftStore } from './draft-store';
import { PreferredPrintingsApi } from './preferred-printings-api';
import { SetCombobox } from './set-combobox';

/** The Printing picker's heading's id, which names the dialog. */
export const PRINTING_PICKER_HEADING = 'printing-picker-heading';

/**
 * The Printing picker, opened on the dialog shell from a basic land in the
 * signed-in player's own plan or deck, locked or not: a large image of a
 * printing of the land, which they browse set by set, newest set first,
 * finding a set by typing part of its code or name, and make their
 * preferred printing, or go back to the default printing. It
 * opens on the printing the land shows now. Browsing changes only the
 * picker; Cancel, Escape and the backdrop close it with no change.
 */
@Component({
  selector: 'app-printing-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SetCombobox],
  templateUrl: './printing-picker.html',
  styleUrls: ['../dialog.scss', './printing-picker.scss'],
})
export class PrintingPicker implements OnInit {
  private readonly store = inject(DraftStore);
  private readonly printings = inject(BasicLandPrintings);
  private readonly api = inject(PreferredPrintingsApi);
  private readonly dialogRef = inject(DialogRef);
  private readonly pendingTasks = inject(PendingTasks);

  /** The basic land whose printings it shows. */
  readonly land = input.required<BasicLand>();

  protected readonly headingId = PRINTING_PICKER_HEADING;
  protected readonly largeImage = LARGE_IMAGE;
  private readonly preferred = computed(
    () => this.store.plan.value().preferredPrintings[this.land()],
  );
  /** Whether the land has a preferred printing, for Use default to clear. */
  protected readonly hasPreferred = computed(() => !!this.preferred());
  /** The printing the land shows now: its preferred printing, or else its default printing. */
  private readonly current = computed((): BasicLandPrintingView => {
    const { scryfallId, set, collectorNumber, images } = basicCard(this.land(), this.preferred());
    return { scryfallId, set, collectorNumber, images: images[0] };
  });

  /** The sets with an English printing of the land, once the API has answered. */
  protected readonly sets = signal<BasicLandPrintingSetView[] | null>(null);
  // Stryker disable next-line BooleanLiteral: `ngOnInit` calls `load`, which sets it false, before the first render.
  protected readonly loadFailed = signal(false);
  protected readonly setIndex = signal(0);
  protected readonly printingIndex = signal(0);
  /** The set chosen, once the sets have loaded. */
  protected readonly set = computed(() => this.sets()?.[this.setIndex()]);
  /** The printing on show: the one browsed to, or the current one until the sets have loaded. */
  protected readonly shown = computed(
    () => this.set()?.printings[this.printingIndex()] ?? this.current(),
  );
  /** What labels the printing on show: its set and collector number. */
  protected readonly label = computed(
    () => `${this.shown().set.toUpperCase()} #${this.shown().collectorNumber}`,
  );
  /** The printings whose CDN image failed to load, by Scryfall id. */
  private readonly brokenImages = signal<ReadonlySet<string>>(new Set());
  /** The image on show: from Scryfall's CDN, or its API by id once that has failed. */
  protected readonly image = computed(() => {
    const { scryfallId, images } = this.shown();
    return this.brokenImages().has(scryfallId)
      ? `https://api.scryfall.com/cards/${scryfallId}?format=image&version=large`
      : images.large;
  });

  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);

  ngOnInit() {
    this.load();
  }

  /**
   * Reads the land's printings, opening on the set and printing the land
   * shows now. The page isn't stable until they have loaded or failed.
   */
  protected load() {
    this.loadFailed.set(false);
    this.pendingTasks.run(async () => {
      try {
        this.opened(await this.printings.sets(this.land()));
      } catch {
        this.loadFailed.set(true);
      }
    });
  }

  /** Shows the sets, on the set and printing the land shows now. */
  private opened(sets: BasicLandPrintingSetView[]) {
    // None are stored until the API's first refresh finishes: the player can try again.
    // Stryker disable next-line ConditionalExpression,BlockStatement: with no sets, `sets[0].printings` throws inside `load`'s `try`, which sets `loadFailed` all the same.
    if (sets.length === 0) {
      this.loadFailed.set(true);
      return;
    }
    const { set, scryfallId } = this.current();
    const setIndex = Math.max(
      sets.findIndex((s) => s.code === set),
      0,
    );
    const printingIndex = sets[setIndex].printings.findIndex((p) => p.scryfallId === scryfallId);
    this.setIndex.set(setIndex);
    this.printingIndex.set(Math.max(printingIndex, 0));
    this.sets.set(sets);
  }

  /** Shows the first printing of `set`. */
  protected chooseSet(set: BasicLandPrintingSetView) {
    this.setIndex.set(this.sets()!.indexOf(set));
    this.printingIndex.set(0);
  }

  /** Steps `by` printings through the set, wrapping at either end. */
  protected step(by: number) {
    // Stryker disable next-line OptionalChaining: stepping is offered only once a set is chosen.
    const count = this.set()?.printings.length ?? 1;
    this.printingIndex.update((index) => (index + by + count) % count);
  }

  protected imageFailed() {
    const { scryfallId } = this.shown();
    this.brokenImages.update((ids) => new Set(ids).add(scryfallId));
  }

  /** Makes the printing on show the land's preferred printing. */
  protected use() {
    return this.save(this.api.set(this.land(), this.shown().scryfallId));
  }

  /** Clears the land's preferred printing, so it shows its default printing. */
  protected useDefault() {
    return this.save(this.api.clear(this.land()));
  }

  protected cancel() {
    this.dialogRef.close();
  }

  /** Sends the change, then shows it everywhere and closes; a failure is said here, changing nothing. */
  private async save(request: Observable<PreferredPrintings>) {
    this.saving.set(true);
    this.saveError.set(null);
    try {
      this.store.showPreferredPrintings(await firstValueFrom(request));
      this.dialogRef.close();
    } catch (err) {
      this.saveError.set(saveFailure(err));
    } finally {
      this.saving.set(false);
    }
  }
}

/** Why saving failed: the API's reason, such as a printing it doesn't store, or else a plain apology. */
function saveFailure(err: unknown): string {
  const problem =
    err instanceof HttpErrorResponse
      ? (err.error as Partial<PreferredPrintingProblem> | null)
      : null;
  return problem?.message ?? 'Couldn’t save your printing. Try again in a moment.';
}
