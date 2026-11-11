import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { BASIC_LANDS, MOST_BASICS, type BasicLand, type PlanView } from 'contract';
import type { Observable } from 'rxjs';
import { Changes, ChangeStatus, FocusKey, SendsChange } from './changes';
import { DraftStore } from './draft-store';
import { changeFailure } from './drafts';
import { manaSymbol } from './mana-cost';
import { PlanApi } from './plan-api';
import { planChangeFailed } from './plan-change-failed';

/** Each basic land's mana symbol, shown beside its name. */
const BASIC_SYMBOLS: Record<BasicLand, string> = {
  Plains: '{W}',
  Island: '{U}',
  Swamp: '{B}',
  Mountain: '{R}',
  Forest: '{G}',
};

/** The Basic lands dialog's heading's id, which names the dialog. */
export const BASIC_LANDS_HEADING = 'basics-heading';

/**
 * The Plan tab's Basic lands dialog, opened on the dialog shell: how many
 * copies of each basic land the signed-in player's mainboard holds, with an
 * Add that puts one more copy on the mainboard, and Clear basics, which
 * takes every basic land off both plan boards. It opens on Done.
 */
@Component({
  selector: 'app-basic-lands-dialog',
  imports: [ChangeStatus, FocusKey, SendsChange],
  providers: [Changes],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './basic-lands-dialog.html',
  styleUrls: ['../dialog.scss', './basic-lands-dialog.scss'],
})
export class BasicLandsDialog {
  private readonly planApi = inject(PlanApi);
  private readonly changes = inject(Changes);
  private readonly store = inject(DraftStore);
  private readonly dialogRef = inject(DialogRef);

  protected readonly headingId = BASIC_LANDS_HEADING;
  private readonly plan = this.store.plan.value;
  protected readonly error = signal<string | null>(null);

  /**
   * Each basic land, with how many copies the mainboard holds, whether the
   * plan holds MOST_BASICS of it across both plan boards, and its mana
   * symbol's image.
   */
  protected readonly basics = computed(() =>
    BASIC_LANDS.map((land) => {
      const held = this.plan().basics.filter((basic) => basic.land === land);
      return {
        land,
        count: held.find((basic) => basic.board === 'Mainboard')?.count ?? 0,
        full: held.reduce((total, basic) => total + basic.count, 0) >= MOST_BASICS,
        symbol: manaSymbol(BASIC_SYMBOLS[land]).src,
      };
    }),
  );
  /** Whether the plan holds any basic land, on either plan board, for Clear basics to clear. */
  protected readonly hasBasics = computed(() => this.plan().basics.length > 0);
  /** Add's tooltip once the plan holds MOST_BASICS of `land`, saying why it is disabled. */
  protected fullTitle(land: BasicLand) {
    return `Your plan already holds ${MOST_BASICS} copies of ${land}.`;
  }

  protected close() {
    this.dialogRef.close();
  }

  /** Adds one copy of a basic land to the mainboard. */
  protected addBasic(land: BasicLand) {
    return this.tryChange(() => this.planApi.addBasic(this.store.id(), land));
  }

  /** Takes every basic land out of the plan. */
  protected clearBasics() {
    // Stryker disable next-line ObjectLiteral,ArrayDeclaration,StringLiteral: Done is the next control after Clear basics, so focus falls back to it anyway.
    return this.tryChange(() => this.planApi.clearBasics(this.store.id()), { keep: ['done'] });
  }

  /**
   * Sends the change `send` makes to the plan and shows the plan it answers
   * with, unless another change is in flight. A refused change means the
   * plan has moved on: say why; the store re-reads it. Focus is kept as
   * `Changes.send` keeps it.
   */
  private tryChange(send: () => Observable<PlanView>, kept: { keep?: string[] } = {}) {
    return this.changes.send(async () => {
      this.error.set(null);
      try {
        await this.store.changePlan(send());
      } catch (err) {
        this.error.set(changeFailure(err, planChangeFailed(this.store.planName())));
      }
    }, kept);
  }
}
