import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  type OnDestroy,
  signal,
} from '@angular/core';
import type { PickView, Platform } from 'contract';
import { LucideCheck } from '@lucide/angular';
import { arenaExport } from './arena-export';
import { CardName } from './card-name';
import { DraftStore } from './draft-store';
import type { ExportPlan } from './export-plan';
import { moxfieldExport } from './moxfield-export';
import { mtgoExport } from './mtgo-export';
import { LoadingAnimation } from '../loading/loading-animation';

/** Where a player's plan can be exported to. */
type ExportTarget = 'Arena' | 'MTGO' | 'Moxfield';

/** Each export target's export of a player's plan. */
const EXPORTS: Record<ExportTarget, (plan: ExportPlan<PickView>) => string> = {
  Arena: arenaExport,
  MTGO: mtgoExport,
  Moxfield: moxfieldExport,
};

/** The export targets a draft on each platform offers. */
const PLATFORM_EXPORTS: Record<Platform, ExportTarget[]> = {
  Arena: ['Arena', 'Moxfield'],
  MTGO: ['MTGO', 'Moxfield'],
};

/** The most sideboard cards Arena's import may keep. */
const ARENA_SIDEBOARD_CAP = 15;

/** How long a copy button shows its confirmation. */
const CONFIRMATION_MS = 2000;

/** The draft view's Export tab: the signed-in player's picks, and their exports. */
@Component({
  selector: 'app-export-tab',
  imports: [CardName, LoadingAnimation, LucideCheck],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './export-tab.html',
  styleUrls: ['../page.scss', './drafts.scss', './draft-panels.scss', './export-tab.scss'],
})
export class ExportTab implements OnDestroy {
  private readonly store = inject(DraftStore);

  /** The draft's platform, which decides the exports offered. */
  private readonly platform = computed<Platform>(() => this.store.shown().platform);
  /** The signed-in player, if they have joined. */
  protected readonly player = this.store.ownPlayer;
  /**
   * The signed-in player's plan, which decides each pick's plan board and adds
   * the basics.
   */
  private readonly plan = this.store.plan.value;
  /** Whether the plan is still on its way. */
  protected readonly planLoading = this.store.plan.loading;
  /** Whether the plan couldn't be loaded. */
  protected readonly planFailed = this.store.plan.failed;
  /** The pick log, in pick order. */
  private readonly picks = this.store.picks.value;
  /** The pool's cards by id, for the Card previews of the names here. */
  protected readonly poolCardsById = this.store.poolCardsById;
  /** Whether the picks are still on their way. */
  protected readonly loading = this.store.picks.loading;
  /** Whether the picks couldn't be loaded. */
  protected readonly failed = this.store.picks.failed;

  /** The player's picks, in pick order. */
  protected readonly playerPicks = computed(() =>
    this.picks().filter((pick) => pick.playerId === this.player()?.id),
  );

  /**
   * What the exports are made of: the plan without its unpicked cards, each
   * plan board's picks in pick order. A pick the plan doesn't have yet is on the
   * mainboard, where every pick lands.
   */
  protected readonly exportPlan = computed<ExportPlan<PickView>>(() => {
    const { sideboard, basics } = this.plan();
    const onSideboard = new Set(sideboard.map((card) => card.poolCardId));
    const picks = this.playerPicks();
    return {
      mainboard: picks.filter((pick) => !onSideboard.has(pick.poolCardId)),
      sideboard: picks.filter((pick) => onSideboard.has(pick.poolCardId)),
      basics,
    };
  });

  /** For the warning's text. */
  protected readonly arenaSideboardCap = ARENA_SIDEBOARD_CAP;
  /** Whether Arena's import may cut the exported sideboard short. */
  protected readonly sideboardOverArenaCap = computed(
    () => this.platform() === 'Arena' && this.exportPlan().sideboard.length > ARENA_SIDEBOARD_CAP,
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

  /** Forgets how the latest copy went, as the panel opens or closes. */
  clearCopy() {
    this.latestCopy++;
    this.clearConfirmation();
    this.copyFailed.set(false);
  }

  /** Copies the plan to the clipboard as an export for `target`, confirming how it went. */
  protected async copyFor(target: ExportTarget) {
    const copy = ++this.latestCopy;
    this.copyFailed.set(false);
    // The same button stays confirmed while it copies again, rather than flickering.
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
    clearTimeout(this.confirmationTimer);
    this.copied.set(null);
  }
}
