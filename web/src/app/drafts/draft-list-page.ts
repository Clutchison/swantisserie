import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import type { DraftListItemView } from 'contract';
import { Auth } from '../auth/auth';
import { LoadingAnimation } from '../loading/loading-animation';
import { doubleTurnSuffix, isActive, isDoubleTurn, isTurnOf } from './drafts';
import { ViewerDrafts } from './viewer-drafts';

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
  private readonly viewerDrafts = inject(ViewerDrafts);
  private readonly viewer = inject(Auth).user;

  /** What the page that sent the viewer here wants them told, e.g. a draft was cancelled. */
  protected readonly notice = inject(Router).currentNavigation()?.extras.state?.['notice'] as
    string | undefined;

  /** The viewer's drafts, read only once they have loaded. */
  private readonly drafts = computed(() => this.viewerDrafts.drafts()!);
  protected readonly loading = this.viewerDrafts.loading;
  protected readonly failed = this.viewerDrafts.failed;
  /** The drafting drafts on the viewer's turn. */
  protected readonly yourTurn = this.viewerDrafts.yourTurn;
  /**
   * The active drafts but those in Your turn, and the complete drafts whose
   * tournament is under way, which aren't active drafts.
   */
  protected readonly active = computed(() => {
    const yourTurn = new Set(this.yourTurn());
    return this.drafts().filter(
      (draft) => (isActive(draft.state) && !yourTurn.has(draft)) || tournamentUnderWay(draft),
    );
  });
  protected readonly complete = computed(() =>
    this.drafts().filter((draft) => draft.state === 'Complete' && !tournamentUnderWay(draft)),
  );
  protected readonly closed = computed(() =>
    this.drafts().filter((draft) => draft.state === 'Closed'),
  );

  constructor() {
    // The tab says so while any draft is on the viewer's turn, so a viewer can
    // tell from their browser's tabs.
    const title = inject(Title);
    const appTitle = title.getTitle();
    inject(DestroyRef).onDestroy(() => title.setTitle(appTitle));
    effect(() => title.setTitle(this.yourTurn().length ? `Your turn · ${appTitle}` : appTitle));
  }

  /**
   * Where a draft in Your turn has got to, as the draft's header puts it:
   * its pick and round, and on a double turn the picks still to make before
   * it passes. Read only for a draft with a turn.
   */
  protected turnText(draft: DraftListItemView): string {
    const turn = draft.turn!;
    const suffix = isDoubleTurn(draft) ? doubleTurnSuffix(turn.picksBeforeTurnPasses) : '';
    return `Pick ${turn.pick}, round ${turn.round}${suffix}`;
  }

  /**
   * What a card in Active drafts says of where the draft stands: its draft state, saying a
   * frozen draft is on the viewer's turn, or, for a complete draft listed there, its tournament's.
   */
  protected listedState(draft: DraftListItemView): string {
    if (tournamentUnderWay(draft)) return `Tournament: ${draft.tournamentBadge!.state}`;
    if (draft.state === 'Frozen' && isTurnOf(draft, this.viewer()?.id)) {
      return 'Your turn (frozen)';
    }
    return draft.state;
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
