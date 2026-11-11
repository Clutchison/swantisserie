import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { LucideMinus, LucidePlus } from '@lucide/angular';
import { BASIC_LANDS, MOST_BASICS, type BasicLand, type PlanView } from 'contract';
import type { Observable } from 'rxjs';
import { Changes, ChangeStatus, FocusKey, SendsChange } from './changes';
import { DraftStore } from './draft-store';
import { changeFailure } from './drafts';
import { manaSymbol } from './mana-cost';
import { PlanApi } from './plan-api';

/** What a failed change says, naming the plan as `planName`. */
const changeFailed = (planName: string) =>
  `Couldn't change your ${planName}. Try again in a moment.`;

/** Each basic land's mana symbol, which labels it. */
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
 * of each basic land the signed-in player's mainboard holds, set with −
 * and +, by typing a number, or all cleared at once. It opens on Done.
 */
@Component({
  selector: 'app-basic-lands-dialog',
  imports: [ChangeStatus, FocusKey, LucideMinus, LucidePlus, SendsChange],
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
  protected readonly changing = this.changes.changing;
  protected readonly error = signal<string | null>(null);

  /** Each basic land, with how many copies the plan holds and its mana symbol's image. */
  protected readonly basics = computed(() =>
    BASIC_LANDS.map((land) => ({
      land,
      count: this.heldBasic(land),
      symbol: manaSymbol(BASIC_SYMBOLS[land]).src,
    })),
  );
  /** Whether the plan holds any basic land, for Clear basics to clear. */
  protected readonly hasBasics = computed(() => this.plan().basics.length > 0);
  /** The most copies of one basic land offered. */
  protected readonly mostBasics = MOST_BASICS;

  protected close() {
    this.dialogRef.close();
  }

  /**
   * Sets how many copies of a basic land the plan holds. Should the button
   * pressed be disabled at the new count, focus goes to the other one.
   */
  protected setBasic(land: BasicLand, count: number) {
    return this.tryChange(() => this.planApi.setBasic(this.store.id(), land, count), {
      // Stryker disable next-line EqualityOperator: `>=` differs only when `count` is the count held, which never reaches `setBasic`: the buttons send one more or one fewer, and typing the count held returns early. The specs on focus after a change pin `<=`.
      keep: [count > this.heldBasic(land) ? `fewer ${land}` : `more ${land}`],
    });
  }

  /**
   * A number typed for a basic land: the plan holds that many, rounded down
   * and kept within 0 to MOST_BASICS. Anything that isn't a number is put
   * back to the count the plan holds, as is a count the api refuses.
   */
  protected async typedBasic(land: BasicLand, held: number, input: HTMLInputElement) {
    // Stryker disable next-line MethodExpression: a number input's value is never bare spaces, as anything that isn't a number reads as `''`.
    const typed = input.value.trim() === '' ? NaN : Number(input.value);
    if (Number.isNaN(typed)) {
      input.value = String(held);
      return;
    }
    const count = Math.min(Math.max(Math.floor(typed), 0), MOST_BASICS);
    // The binding only writes the input when the count changes, as it may not.
    input.value = String(count);
    if (count === held || (await this.setBasic(land, count))) return;
    // Put back the early write: the binding writes the input only if the re-read plan's count differs.
    input.value = String(this.heldBasic(land));
  }

  /** Takes every basic land out of the plan. */
  protected clearBasics() {
    // Stryker disable next-line ObjectLiteral,ArrayDeclaration,StringLiteral: Done is the next control after Clear basics, so focus falls back to it anyway.
    return this.tryChange(() => this.planApi.clearBasics(this.store.id()), { keep: ['done'] });
  }

  /** How many copies of `land` the plan holds. */
  private heldBasic(land: BasicLand) {
    return this.plan().basics.find((basic) => basic.land === land)?.count ?? 0;
  }

  /**
   * Sends the change `send` makes to the plan and shows the plan it answers
   * with, unless another change is in flight. A refused change means the
   * plan has moved on: say why; the store re-reads it. Answers whether the
   * change was made. Focus is kept as `Changes.send` keeps it.
   */
  private tryChange(
    send: () => Observable<PlanView>,
    kept: { keep?: string[] } = {},
  ): Promise<boolean> {
    return this.changes.send(async () => {
      this.error.set(null);
      try {
        await this.store.changePlan(send());
        // Stryker disable next-line BooleanLiteral: once a change is made, `typedBasic` writes back the plan's count, which is the count just set.
        return true;
      } catch (err) {
        this.error.set(changeFailure(err, changeFailed(this.store.planName())));
        return false;
      }
    }, kept);
  }
}
