import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { arenaExport } from './arena-export';
import { CardPreviewName } from './card-preview';
import { type PickView, type PlayerView, type PoolCardView } from './drafts';
import { moxfieldExport } from './moxfield-export';

/** Where a player's picks can be exported to. */
type ExportTarget = 'Arena' | 'Moxfield';

/** The draft view's Picks panel: one player's picks, which can be exported. */
@Component({
  selector: 'app-picks-tab',
  imports: [CardPreviewName],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './picks-tab.html',
  styleUrls: ['./drafts.scss', './draft-panels.scss', './picks-tab.scss'],
})
export class PicksTab {
  /** The player whose picks to show, if any. */
  readonly player = input.required<PlayerView | null>();
  /** Whether `player` is the signed-in player. */
  readonly own = input.required<boolean>();
  /** The pick log, in pick order. */
  readonly picks = input.required<PickView[]>();
  /** The pool's cards by oracle id, for the Card previews of the names here. */
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

  /** How the latest copy of the picks went: what it was copied for, or that it failed. */
  protected readonly picksCopy = signal<ExportTarget | 'Failed' | null>(null);

  /** Forgets how the latest copy went, as the panel is opening or closing. */
  clearCopy() {
    this.picksCopy.set(null);
  }

  /** Copies `picks` to the clipboard as an Arena export. */
  protected copyForArena(picks: PickView[]) {
    return this.copyPicks('Arena', arenaExport(picks));
  }

  /** Copies `picks` to the clipboard as a Moxfield export. */
  protected copyForMoxfield(picks: PickView[]) {
    return this.copyPicks('Moxfield', moxfieldExport(picks));
  }

  /** Copies an export's `text` to the clipboard, reporting how it went in `picksCopy`. */
  private async copyPicks(target: ExportTarget, text: string) {
    this.picksCopy.set(null);
    try {
      await navigator.clipboard.writeText(text);
      this.picksCopy.set(target);
    } catch {
      this.picksCopy.set('Failed');
    }
  }
}
