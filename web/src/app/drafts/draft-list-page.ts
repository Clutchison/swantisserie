import { NgTemplateOutlet } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { DraftListItemView } from 'contract';
import { LoadingAnimation } from '../loading/loading-animation';
import { isActive } from './drafts';

/** Names a list of players as a sentence does: "Alice", "Alice and Bob", "Alice, Bob, and Carol". */
const NAMES = new Intl.ListFormat('en', { type: 'conjunction' });

/** Whether the draft's tournament is in registration or playing. Only a complete draft has a tournament. */
function tournamentUnderWay(draft: DraftListItemView): boolean {
  const state = draft.tournamentBadge?.state;
  return state === 'Registration' || state === 'Playing';
}

@Component({
  selector: 'app-draft-list-page',
  imports: [LoadingAnimation, NgTemplateOutlet, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './draft-list-page.html',
  styleUrls: ['../page.scss', './drafts.scss', './draft-list-page.scss'],
})
export class DraftListPage {
  /** Read once per visit: the list has no live updates, so a badge is as fresh as the visit. */
  private readonly drafts = httpResource<DraftListItemView[]>(() => '/api/drafts');

  /** What the page that sent the viewer here wants them told, e.g. a draft was cancelled. */
  protected readonly notice = inject(Router).currentNavigation()?.extras.state?.['notice'] as
    string | undefined;

  protected readonly loading = this.drafts.isLoading;
  protected readonly failed = computed(() => !!this.drafts.error());
  /**
   * The active drafts, and the complete drafts whose tournament is under way, which aren't active drafts.
   * The lists are read only once the drafts have loaded.
   */
  protected readonly active = computed(() =>
    this.drafts.value()!.filter((draft) => isActive(draft.state) || tournamentUnderWay(draft)),
  );
  protected readonly complete = computed(() =>
    this.drafts
      .value()!
      .filter((draft) => draft.state === 'Complete' && !tournamentUnderWay(draft)),
  );
  protected readonly closed = computed(() =>
    this.drafts.value()!.filter((draft) => draft.state === 'Closed'),
  );

  /**
   * What a card in Active drafts says of where the draft stands: its draft state, or, for a
   * complete draft listed there, its tournament's.
   */
  protected listedState(draft: DraftListItemView): string {
    // Stryker disable next-line OptionalChaining: the badge is read only once `tournamentUnderWay` has found one.
    return tournamentUnderWay(draft) ? `Tournament: ${draft.tournamentBadge?.state}` : draft.state;
  }

  /**
   * The names of the draft's tournament's trophy holders, as one phrase.
   * Trophy holders have tournament entries, so each is one of the draft’s players.
   * Read only for a draft with a tournament.
   */
  protected trophyHolders(draft: DraftListItemView): string {
    const names = draft.tournamentBadge!.trophyHolders.flatMap((id) =>
      draft.players.filter((player) => player.id === id).map((player) => player.name),
    );
    return NAMES.format(names);
  }
}
