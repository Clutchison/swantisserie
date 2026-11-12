import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  type OnDestroy,
  signal,
} from '@angular/core';
import type { Platform, PoolCardView } from 'contract';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { LucideCheck, LucideChevronDown } from '@lucide/angular';
import { arenaExport } from './arena-export';
import { DraftStore } from './draft-store';
import type { ExportPlan } from './export-plan';
import { moxfieldExport } from './moxfield-export';
import { mtgoExport } from './mtgo-export';

/** Where a player's deck can be exported to. */
export type ExportTarget = 'Arena' | 'MTGO' | 'Moxfield';

/** Each export target's export of a player's deck. */
const EXPORTS: Record<ExportTarget, (plan: ExportPlan<PoolCardView>) => string> = {
  Arena: arenaExport,
  MTGO: mtgoExport,
  Moxfield: moxfieldExport,
};

/** The export targets a draft on each platform offers. */
const PLATFORM_EXPORTS: Record<Platform, ExportTarget[]> = {
  Arena: ['Arena', 'Moxfield'],
  MTGO: ['MTGO', 'Moxfield'],
};

/** How long the Copy button shows its confirmation. */
const CONFIRMATION_MS = 2000;

/**
 * The Deck tab's Copy button, whose menu offers one item per export the
 * draft's platform offers, each copying the signed-in player's deck as that
 * export. It shows once the player has a pick and their deck has loaded,
 * locked or not.
 */
@Component({
  selector: 'app-export-buttons',
  imports: [CdkMenu, CdkMenuItem, CdkMenuTrigger, LucideCheck, LucideChevronDown],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'group', 'aria-label': 'Exports' },
  templateUrl: './export-buttons.html',
  styleUrls: ['../page.scss', './drafts.scss', './export-buttons.scss'],
})
export class ExportButtons implements OnDestroy {
  private readonly store = inject(DraftStore);

  /** What the exports are made of. */
  private readonly exportPlan = this.store.exportPlan;

  /** Whether there's a deck to copy: the player has a pick, and their picks and deck have loaded. */
  protected readonly ready = computed(() => {
    const { mainboard, sideboard } = this.exportPlan();
    return mainboard.length + sideboard.length > 0 && this.store.exportPlanLoaded();
  });

  /** In the order the Copy menu offers them. */
  protected readonly exportTargets = computed(() => PLATFORM_EXPORTS[this.store.shown().platform]);

  /** What the latest copy of the deck was copied for, while it's confirmed. */
  protected readonly copied = signal<ExportTarget | null>(null);
  /** Whether the latest copy of the deck failed. */
  protected readonly copyFailed = signal(false);

  private confirmationTimer?: ReturnType<typeof setTimeout>;
  /** The latest copy attempt, so that an earlier or cleared one can't report how it went. */
  private latestCopy = 0;

  // Stryker disable next-line BlockStatement: a timer left running after teardown only sets `copied` on a destroyed component.
  ngOnDestroy() {
    // Stryker disable next-line CallExpression: a timer left running after teardown only sets `copied` on a destroyed component.
    clearTimeout(this.confirmationTimer);
  }

  /** Forgets how the latest copy went, as the Deck tab opens or closes. */
  clearCopy() {
    this.latestCopy++;
    this.clearConfirmation();
    this.copyFailed.set(false);
  }

  /** Copies the deck to the clipboard as an export for `target`, confirming how it went. */
  protected async copyFor(target: ExportTarget) {
    const copy = ++this.latestCopy;
    this.copyFailed.set(false);
    // The Copy button stays confirmed while it copies the same export again, rather than flickering.
    if (this.copied() !== target) {
      this.clearConfirmation();
    }
    try {
      await navigator.clipboard.writeText(EXPORTS[target](this.exportPlan()));
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
    // Stryker disable next-line CallExpression: confirm() clears the timer itself before restarting it, and meanwhile it only sets null over null.
    clearTimeout(this.confirmationTimer);
    this.copied.set(null);
  }
}
