import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { DraftView, MatchView, TournamentFormat } from 'contract';
import type { Observable } from 'rxjs';
import { LoadingAnimation } from '../loading/loading-animation';
import { ChangeStatus, Changes, SendsChange } from './changes';
import { DraftStore } from './draft-store';
import { changeFailure } from './drafts';
import { PlayerAvatar } from './player-avatar';
import { TournamentApi } from './tournament-api';
import { TournamentResults, type ClearResult, type SetResult } from './tournament-results';

/** The formats tournament setup offers, as it names them: only round robin for now. */
const FORMATS: { format: TournamentFormat; name: string }[] = [
  { format: 'RoundRobin', name: 'Round robin' },
];

/** A game score a player reports, as their games won and their opponent's. */
interface Result {
  label: string;
  own: number;
  theirs: number;
}

/** The game scores a player can report: 2–0 or 2–1 for either side, never a draw. */
const RESULTS: Result[] = [
  { label: 'Won 2–0', own: 2, theirs: 0 },
  { label: 'Won 2–1', own: 2, theirs: 1 },
  { label: 'Lost 1–2', own: 1, theirs: 2 },
  { label: 'Lost 0–2', own: 0, theirs: 2 },
];

/**
 * The Tournament tab of a complete draft: the setup form for organizers
 * before its tournament is set up, then registration, where the draft's
 * players join and leave and organizers remove them, start it or cancel
 * it, then play: the signed-in player's match and its report, the
 * standings and matches, the players with Drop, and Undo drop for
 * organizers, Complete tournament for organizers, and at last the trophy.
 */
@Component({
  selector: 'app-tournament-tab',
  imports: [
    ChangeStatus,
    LoadingAnimation,
    PlayerAvatar,
    RouterLink,
    SendsChange,
    TournamentResults,
  ],
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
  protected readonly joined = this.store.joinedTournament;
  /** Join is offered to the draft's human players during registration; bots never join. */
  protected readonly offerJoin = computed(
    () =>
      this.tournament()?.state === 'Registration' &&
      !this.joined() &&
      !!this.store.ownPlayer() &&
      !this.store.ownPlayer()?.isBot,
  );
  protected readonly offerLeave = computed(
    () => this.tournament()?.state === 'Registration' && this.joined(),
  );
  /** Organizers may remove joined players, start and cancel the tournament during registration. */
  protected readonly offerOrganize = computed(
    () => this.canOrganize() && this.tournament()?.state === 'Registration',
  );
  /** Start needs at least 2 joined players. */
  protected readonly canStart = computed(() => this.entries().length >= 2);
  /** Organizers complete a round robin tournament while it is playing. */
  protected readonly offerComplete = computed(
    () => this.canOrganize() && this.tournament()?.state === 'Playing',
  );
  /** The game scores a player reports, from their side. */
  protected readonly results = RESULTS;

  /** The match the signed-in player chose to report from the tournament rounds, if any. */
  protected readonly chosen = signal<string | undefined>(undefined);
  /** Whether "Your match" shows: to a player who joined and hasn't dropped, while the tournament is playing. */
  protected readonly showOwnMatch = computed(
    () => this.tournament()?.state === 'Playing' && this.joined() && !this.ownDropped(),
  );
  /** The joined players once the tournament is playing, in join order, with whether each dropped. */
  protected readonly players = computed(() =>
    (this.tournament()?.entries ?? []).map((entry) => ({
      ...this.store.player(entry.playerId),
      dropped: entry.dropped,
    })),
  );
  /** Whether the signed-in player joined and has dropped. */
  private readonly ownDropped = computed(
    () => !!this.tournament()?.entries.find((entry) => entry.playerId === this.ownId())?.dropped,
  );
  /** Drop is offered to a player who joined and hasn't dropped, while the tournament is playing. */
  protected readonly offerDrop = computed(
    () => this.tournament()?.state === 'Playing' && this.joined() && !this.ownDropped(),
  );
  /** Organizers may drop players and take drops back while the tournament is playing. */
  protected readonly offerDrops = computed(
    () => this.canOrganize() && this.tournament()?.state === 'Playing',
  );
  /**
   * The signed-in player's match shown at the top: the one they chose, while
   * it is unreported, else their first unreported match by tournament round.
   */
  protected readonly ownMatch = computed(() => {
    const ownId = this.ownId();
    if (!ownId || !this.showOwnMatch()) return undefined;
    const open = (this.tournament()?.rounds ?? []).flatMap(({ round, matches }) =>
      matches
        .filter((match) => match.players.includes(ownId) && match.outcome.kind === 'Unreported')
        .map((match) => ({ round, match })),
    );
    const shown = open.find(({ match }) => match.id === this.chosen()) ?? open[0];
    if (!shown) return undefined;
    const opponentId = shown.match.players.find((id) => id !== ownId)!;
    return { ...shown, opponent: this.store.player(opponentId) };
  });
  /** The players who hold the trophy, as the draft names them. */
  protected readonly trophyHolders = computed(() =>
    (this.tournament()?.trophyHolders ?? []).map((id) => this.store.player(id)),
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

  /** Starts the tournament, once the organizer confirms. */
  protected start() {
    return this.send(
      () =>
        confirm('Start the tournament? Joining closes, and every match opens.')
          ? this.api.start(this.draft().id)
          : undefined,
      { failure: "Couldn't start the tournament. Try again in a moment." },
    );
  }

  /** Reports the signed-in player's match at `result`, from their side, once they confirm. */
  protected report(match: MatchView, opponent: string, result: Result) {
    const games: [number, number] =
      match.players[0] === this.ownId() ? [result.own, result.theirs] : [result.theirs, result.own];
    return this.send(
      () =>
        confirm(
          `Report that you ${result.own > result.theirs ? 'won' : 'lost'} ${result.own}–${result.theirs} against ${opponent}? Only an organizer can change a reported match.`,
        )
          ? this.api.report(this.draft().id, match.id, games)
          : undefined,
      { failure: "Couldn't report the match. Try again in a moment." },
    );
  }

  /** Drops the signed-in player from the tournament, once they confirm. */
  protected dropSelf() {
    return this.send(
      () =>
        confirm(
          'Drop from the tournament? Your unplayed matches become forfeits, and only an organizer can take it back. Your deck stays locked until the tournament is complete.',
        )
          ? this.api.drop(this.draft().id, this.ownId()!)
          : undefined,
      { failure: "Couldn't drop from the tournament. Try again in a moment." },
    );
  }

  /** Drops the player `playerId`, named `name`, once the organizer confirms. */
  protected drop(playerId: string, name: string) {
    return this.send(
      () =>
        confirm(`Drop ${name} from the tournament? Their unplayed matches become forfeits.`)
          ? this.api.drop(this.draft().id, playerId)
          : undefined,
      { failure: "Couldn't drop the player. Try again in a moment." },
    );
  }

  /** Takes back the drop of the player `playerId`; for organizers. */
  protected undoDrop(playerId: string) {
    return this.send(() => this.api.undoDrop(this.draft().id, playerId), {
      failure: "Couldn't undo the drop. Try again in a moment.",
    });
  }

  /** Completes the tournament, once the organizer confirms. */
  protected complete() {
    return this.send(
      () =>
        confirm(
          'Complete the tournament? Its unreported matches become granted draws, and the trophy is awarded.',
        )
          ? this.api.complete(this.draft().id)
          : undefined,
      { failure: "Couldn't complete the tournament. Try again in a moment." },
    );
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

  /** Cancels the tournament being played, once the organizer confirms. */
  protected cancelPlaying() {
    return this.send(
      () =>
        confirm(
          'Cancel the tournament? Its matches are removed, nothing from it counts, and every deck unlocks.',
        )
          ? this.api.cancel(this.draft().id)
          : undefined,
      { failure: "Couldn't cancel the tournament. Try again in a moment.", keep: ['set-up'] },
    );
  }

  /** Confirms the signed-in player's match `matchId`. */
  protected confirmMatch(matchId: string) {
    return this.send(() => this.api.confirm(this.draft().id, matchId), {
      failure: "Couldn't confirm the match. Try again in a moment.",
    });
  }

  /** Sets a match's game score, as an organizer reports or corrects it. */
  protected setResult({ matchId, games }: SetResult) {
    return this.send(() => this.api.setResult(this.draft().id, matchId, games), {
      failure: "Couldn't save the match’s result. Try again in a moment.",
      keep: [`correct ${matchId}`],
    });
  }

  /** Clears a match's result, once the organizer confirms. */
  protected clearResult({ matchId, label }: ClearResult) {
    const after =
      this.tournament()?.state === 'Complete'
        ? 'The match becomes a granted draw.'
        : 'The match is unreported again.';
    return this.send(
      () =>
        confirm(`Clear the result of ${label}? ${after}`)
          ? this.api.clearResult(this.draft().id, matchId)
          : undefined,
      {
        failure: "Couldn't clear the match’s result. Try again in a moment.",
        keep: [`correct ${matchId}`],
      },
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
