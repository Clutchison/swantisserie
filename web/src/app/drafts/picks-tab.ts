import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  type OnDestroy,
  output,
  signal,
} from '@angular/core';
import type { PickView, Platform, PlayerView, PoolCardView } from 'contract';
import { arenaExport } from './arena-export';
import { CardName } from './card-name';
import { moxfieldExport } from './moxfield-export';
import { mtgoExport } from './mtgo-export';
import { LoadingAnimation } from '../loading/loading-animation';

/** Where a player's picks can be exported to. */
type ExportTarget = 'Arena' | 'MTGO' | 'Moxfield';

/** Each export target's export of a player's picks. */
const EXPORTS: Record<ExportTarget, (picks: PickView[]) => string> = {
  Arena: arenaExport,
  MTGO: mtgoExport,
  Moxfield: moxfieldExport,
};

/** The export targets a draft on each platform offers. */
const PLATFORM_EXPORTS: Record<Platform, ExportTarget[]> = {
  Arena: ['Arena', 'Moxfield'],
  MTGO: ['MTGO', 'Moxfield'],
};

/** How long a copy button shows its confirmation. */
const CONFIRMATION_MS = 2000;

/** The draft view's Picks panel: one player's picks, which can be exported. */
@Component({
  selector: 'app-picks-tab',
  imports: [CardName, LoadingAnimation],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './picks-tab.html',
  styleUrls: ['./drafts.scss', './draft-panels.scss', './picks-tab.scss'],
})
export class PicksTab implements OnDestroy {
  /** The draft's platform, which decides the exports offered. */
  readonly platform = input.required<Platform>();
  /** The player whose picks to show, if any. */
  readonly player = input.required<PlayerView | null>();
  /** Whether `player` is the signed-in player. */
  readonly own = input.required<boolean>();
  /** The pick log, in pick order. */
  readonly picks = input.required<PickView[]>();
  /** The pool's cards by id, for the Card previews of the names here. */
  readonly poolCardsById = input.required<ReadonlyMap<string, PoolCardView>>();
  /** Whether the picks are still on their way. */
  readonly loading = input(false);
  /** Whether the picks couldn't be loaded. */
  readonly failed = input(false);
  /** Back to the Board was chosen. */
  readonly boardChosen = output<void>();

  /** The player's picks, in pick order. */
  protected readonly playerPicks = computed(() =>
    this.picks().filter((pick) => pick.playerId === this.player()?.id),
  );

  /** In the order their buttons show. */
  protected readonly exportTargets = computed(() => PLATFORM_EXPORTS[this.platform()]);

  /** What the latest copy of the picks was copied for, while it's confirmed. */
  protected readonly copied = signal<ExportTarget | null>(null);
  /** Whether the latest copy of the picks failed. */
  protected readonly copyFailed = signal(false);

  private confirmationTimer?: ReturnType<typeof setTimeout>;
  /** The latest copy attempt, so that an earlier or cleared one can't report how it went. */
  private latestCopy = 0;

  ngOnDestroy() {
    clearTimeout(this.confirmationTimer);
  }

  /** Forgets how the latest copy went, as the panel opens, closes or shows another player. */
  clearCopy() {
    this.latestCopy++;
    this.clearConfirmation();
    this.copyFailed.set(false);
  }

  /** Copies `picks` to the clipboard as an export for `target`, confirming how it went. */
  protected async copyFor(target: ExportTarget, picks: PickView[]) {
    const copy = ++this.latestCopy;
    this.copyFailed.set(false);
    // The same button stays confirmed while it copies again, rather than flickering.
    if (this.copied() !== target) {
      this.clearConfirmation();
    }
    try {
      await navigator.clipboard.writeText(EXPORTS[target](picks));
      if (copy === this.latestCopy) {
        this.confirm(target);
      }
    } catch {
      if (copy === this.latestCopy) {
        this.clearConfirmation();
        this.copyFailed.set(true);
      }
    }
  }

  /** Shows the confirmation for `target` for `CONFIRMATION_MS`. */
  private confirm(target: ExportTarget) {
    clearTimeout(this.confirmationTimer);
    this.copied.set(target);
    this.confirmationTimer = setTimeout(() => this.copied.set(null), CONFIRMATION_MS);
  }

  private clearConfirmation() {
    clearTimeout(this.confirmationTimer);
    this.copied.set(null);
  }
}
