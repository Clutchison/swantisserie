import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { DraftView, TournamentFormat } from 'contract';
import type { Observable } from 'rxjs';
import { LoadingAnimation } from '../loading/loading-animation';
import { ChangeStatus, Changes, SendsChange } from './changes';
import { DraftStore } from './draft-store';
import { changeFailure } from './drafts';
import { PlayerAvatar } from './player-avatar';
import { TournamentApi } from './tournament-api';

/** The formats tournament setup offers, as it names them: only round robin for now. */
const FORMATS: { format: TournamentFormat; name: string }[] = [
  { format: 'RoundRobin', name: 'Round robin' },
];

/**
 * The Tournament tab of a complete draft: the setup form for organizers
 * before its tournament is set up, then registration, where the draft's
 * players join and leave and organizers remove them or cancel it.
 */
@Component({
  selector: 'app-tournament-tab',
  imports: [ChangeStatus, LoadingAnimation, PlayerAvatar, SendsChange],
  providers: [Changes],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tournament-tab.html',
  styleUrls: ['../page.scss', './drafts.scss', './draft-panels.scss', './tournament-tab.scss'],
})
export class TournamentTab {
  private readonly api = inject(TournamentApi);
  private readonly changes = inject(Changes);
  private readonly store = inject(DraftStore);

  private readonly draft = this.store.shown;
  protected readonly read = this.store.tournament;
  protected readonly tournament = this.store.tournament.value;
  protected readonly canOrganize = this.store.canOrganize;
  protected readonly formats = FORMATS;
  protected readonly format = signal<TournamentFormat>('RoundRobin');
  protected readonly error = signal<string | null>(null);

  /** Whether the draft has a tournament; before then organizers see the setup form. */
  protected readonly setUp = computed(() => !!this.draft().tournament);
  /** The joined players, in join order, as the draft names them. */
  protected readonly entries = computed(() =>
    (this.tournament()?.entries ?? []).map((entry) => this.store.player(entry.playerId)),
  );
  /** The signed-in player's id, if they are one of the draft's players. */
  protected readonly ownId = computed(() => this.store.ownPlayer()?.id);
  /** Whether the signed-in player has joined. */
  protected readonly entered = this.store.enteredTournament;
  /** Join is offered to the draft's human players during registration; bots never join. */
  protected readonly offerJoin = computed(
    () =>
      this.tournament()?.state === 'Registration' &&
      !this.entered() &&
      !!this.store.ownPlayer() &&
      !this.store.ownPlayer()?.isBot,
  );
  protected readonly offerLeave = computed(
    () => this.tournament()?.state === 'Registration' && this.entered(),
  );
  /** Organizers may remove joined players and cancel the tournament during registration. */
  protected readonly offerOrganize = computed(
    () => this.canOrganize() && this.tournament()?.state === 'Registration',
  );

  /** Sets up the tournament in the format chosen. */
  protected setUpTournament() {
    return this.send(() => this.api.setUp(this.draft().id, this.format()), {
      failure: "Couldn't set up the tournament. Try again in a moment.",
    });
  }

  protected join() {
    return this.send(() => this.api.join(this.draft().id), {
      failure: "Couldn't join the tournament. Try again in a moment.",
      keep: ['leave'],
    });
  }

  protected leave(playerId: string) {
    return this.send(() => this.api.removeEntry(this.draft().id, playerId), {
      failure: "Couldn't leave the tournament. Try again in a moment.",
      keep: ['join'],
    });
  }

  protected remove(playerId: string) {
    return this.send(() => this.api.removeEntry(this.draft().id, playerId), {
      failure: "Couldn't remove the player. Try again in a moment.",
    });
  }

  /** Cancels the tournament, once the organizer confirms. */
  protected cancel() {
    return this.send(
      () =>
        confirm(
          'Cancel the tournament? Everyone who joined is taken out of it, and their decks unlock.',
        )
          ? this.api.cancel(this.draft().id)
          : undefined,
      { failure: "Couldn't cancel the tournament. Try again in a moment.", keep: ['set-up'] },
    );
  }

  /**
   * Sends a change to the tournament, the request `send` makes, and shows
   * the draft it answers with, unless another change is in flight; `send`
   * makes none if the organizer thinks better of it. A refusal's reason, or
   * else `failure`, is shown if it fails.
   */
  private send(
    send: () => Observable<DraftView> | undefined,
    { failure, keep }: { failure: string; keep?: string[] },
  ) {
    return this.changes.send(
      async () => {
        const request = send();
        if (!request) return;
        this.error.set(null);
        try {
          await this.store.changeDraft(request);
          return true;
        } catch (err) {
          this.error.set(changeFailure(err, failure));
          return false;
        }
      },
      { keep },
    );
  }
}
