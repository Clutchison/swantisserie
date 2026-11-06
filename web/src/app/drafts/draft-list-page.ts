import { NgTemplateOutlet } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { DraftListItemView } from 'contract';
import { LoadingAnimation } from '../loading/loading-animation';
import { isActive } from './drafts';

/** Names a list of players as a sentence does: "Alice", "Alice and Bob", "Alice, Bob, and Carol". */
const NAMES = new Intl.ListFormat('en', { type: 'conjunction' });

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
  protected readonly active = computed(() =>
    (this.drafts.value() ?? []).filter((draft) => isActive(draft.state)),
  );
  protected readonly closed = computed(() =>
    (this.drafts.value() ?? []).filter((draft) => draft.state === 'Closed'),
  );
  protected readonly complete = computed(() =>
    (this.drafts.value() ?? []).filter((draft) => draft.state === 'Complete'),
  );

  /**
   * The names of the draft's tournament's trophy holders, as one phrase.
   * Trophy holders are entrants, so each is one of the draft's players.
   */
  protected trophyHolders(draft: DraftListItemView): string {
    const names = (draft.tournamentBadge?.trophyHolders ?? []).flatMap((id) =>
      draft.players.filter((player) => player.id === id).map((player) => player.name),
    );
    return NAMES.format(names);
  }
}
