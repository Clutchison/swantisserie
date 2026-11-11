import { DialogRef } from '@angular/cdk/dialog';
import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { DraftView, PlayerView, TournamentView, TrophyHallRowView } from 'contract';
import { summaryOf } from '../drafts/round-names';
import { ResultsGrid } from '../drafts/results-grid';
import { anotherPlayer, TournamentPlayers } from '../drafts/tournament-players';
import { TournamentResults } from '../drafts/tournament-results';
import { LoadingAnimation } from '../loading/loading-animation';

/** The Tournament summary's heading's id, which names the dialog. */
export const TOURNAMENT_SUMMARY_HEADING = 'tournament-summary-heading';

/**
 * The Tournament summary, opened on the dialog shell from a Trophy Hall
 * row's View Tournament: headed by its draft's name, its pool source, the
 * date it completed, its format and its player count, then its final
 * standings, or results grid in round robin, and its bracket in single
 * elimination, as the Play tab shows them, with links to the draft's Play
 * and Lists tabs. It reads the draft, for its players' names, and its
 * tournament. Nobody organizes here and nobody's matches are their own,
 * so nothing in it changes the tournament.
 */
@Component({
  selector: 'app-tournament-summary',
  imports: [DatePipe, LoadingAnimation, ResultsGrid, RouterLink, TournamentResults],
  providers: [{ provide: TournamentPlayers, useExisting: TournamentSummary }],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tournament-summary.html',
  styleUrls: ['../dialog.scss', './tournament-summary.scss'],
})
export class TournamentSummary implements TournamentPlayers {
  private readonly dialogRef = inject(DialogRef);

  /** The Trophy Hall row it was opened from. */
  readonly row = input.required<TrophyHallRowView>();
  /** The pool source as the row's group is headed by it. */
  readonly poolSource = input.required<string>();

  protected readonly headingId = TOURNAMENT_SUMMARY_HEADING;

  private readonly draft = httpResource<DraftView>(() => `/api/drafts/${this.row().draftId}`);
  protected readonly tournament = httpResource<TournamentView>(
    () => `/api/drafts/${this.row().draftId}/tournament`,
  );

  protected readonly failed = computed(() => !!this.draft.error() || !!this.tournament.error());
  protected readonly loaded = computed(() => this.draft.hasValue() && this.tournament.hasValue());

  /** Its format, and for Swiss its round option, with its tournament rounds, as the Play tab sums them up. */
  protected readonly format = computed(() => summaryOf(this.tournament.value()!));

  readonly canOrganize = signal(false).asReadonly();

  player(id: string): PlayerView {
    return this.draft.value()?.players.find((player) => player.id === id) ?? anotherPlayer(id);
  }

  protected close() {
    this.dialogRef.close();
  }
}
