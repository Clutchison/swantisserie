import type { DialogRef } from '@angular/cdk/dialog';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  inputBinding,
  Injector,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  SWISS_ROUND_OPTIONS,
  TOURNAMENT_FORMAT_NAMES,
  type CompleteRoundRequest,
  type DraftView,
  type GameScore,
  type MatchView,
  type SwissRoundOption,
  type TournamentFormat,
  type TournamentSetupRequest,
  type TournamentView,
} from 'contract';
import { GAME_SCORES, SWISS_ROUND_CAP } from 'engine';
import { firstValueFrom, type Observable } from 'rxjs';
import { DialogShell } from '../dialog-shell';
import { LoadingAnimation } from '../loading/loading-animation';
import { ChangeStatus, Changes, SendsChange } from './changes';
import { COMPLETE_ROUND_HEADING, CompleteRoundDialog } from './complete-round-dialog';
import {
  CORRECTION_WARNING_HEADING,
  CorrectionWarningDialog,
  type CorrectionWarning,
} from './correction-warning-dialog';
import { DraftStore } from './draft-store';
import { versus } from './match-lines';
import { changeFailure } from './drafts';
import { PlayerAvatar } from './player-avatar';
import { TournamentApi } from './tournament-api';
import { TournamentResults, type ClearGameScore, type SetGameScore } from './tournament-results';

/** The format's name as the tab starts a line with it, such as "Round robin". */
function formatName(format: TournamentFormat): string {
  const name = TOURNAMENT_FORMAT_NAMES[format];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** The formats tournament setup offers, in order, as it names them. */
const FORMATS = (Object.keys(TOURNAMENT_FORMAT_NAMES) as TournamentFormat[]).map((format) => ({
  format,
  name: formatName(format),
}));

/** How tournament setup names each Swiss round option, and how the tab sums it up. */
const SWISS_ROUND_OPTION_NAMES: Record<SwissRoundOption, { name: string; summary: string }> = {
  UntilWinner: { name: 'Until there’s a winner', summary: 'until there’s a winner' },
  CappedAt3: {
    name: `Capped at ${SWISS_ROUND_CAP} tournament rounds`,
    summary: `capped at ${SWISS_ROUND_CAP}`,
  },
};

/** The Swiss round options tournament setup offers, in order, as it names them. */
const SWISS_ROUND_CHOICES = SWISS_ROUND_OPTIONS.map((option) => ({
  option,
  ...SWISS_ROUND_OPTION_NAMES[option],
}));

/**
 * The tournament's format, and for Swiss its round option, with how many
 * tournament rounds it has, or will have, if any, such as "Swiss, capped
 * at 3: 3 tournament rounds".
 */
function summaryOf({ format, swissRoundOption, roundCount }: TournamentView): string {
  const name =
    format === 'Swiss' && swissRoundOption
      ? `Swiss, ${SWISS_ROUND_OPTION_NAMES[swissRoundOption].summary}`
      : formatName(format);
  if (roundCount === 0) return name;
  return `${name}: ${roundCount} tournament ${roundCount === 1 ? 'round' : 'rounds'}`;
}

/** What Start asks the organizer to confirm, by format. */
const START_QUESTIONS: Record<TournamentFormat, string> = {
  RoundRobin: 'Start the tournament? Joining closes, and every match opens.',
  Swiss: 'Start the tournament? Joining closes, and tournament round 1 is paired at random.',
  SingleElimination:
    'Start the tournament? Joining closes, the players are seeded at random into the bracket, and tournament round 1 opens.',
};

/** A game score as a player reports it, from their side: their games won, then their opponent's. */
interface OwnGameScore {
  label: string;
  own: number;
  theirs: number;
}

/** The game scores a player can report, from their side: won or lost 2–0 or 2–1, never a draw. */
const OWN_GAME_SCORES: OwnGameScore[] = GAME_SCORES.map(([own, theirs]) => ({
  label: `${own > theirs ? 'Won' : 'Lost'} ${own}–${theirs}`,
  own,
  theirs,
}));

/**
 * The Tournament tab of a complete draft: the setup form for organizers
 * before its tournament is set up, then registration, where the draft's
 * players join and leave and organizers remove them, start it or cancel
 * it, then play: the signed-in player's match and its report, the
 * standings and matches, the players with Drop, and Reinstate for
 * organizers, Complete tournament (round robin) or Complete round (Swiss,
 * whose dialog grants draws in unreported matches, and single elimination,
 * whose dialog picks their winners) for organizers, and at last the trophy.
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
  private readonly dialogs = inject(DialogShell);
  private readonly injector = inject(Injector);

  private readonly draft = this.store.shown;
  protected readonly read = this.store.tournament;
  protected readonly tournament = this.store.tournament.value;
  /** The tournament's state; undefined until it has loaded, and while there is none. */
  protected readonly state = this.store.tournamentState;
  protected readonly canOrganize = this.store.canOrganize;
  protected readonly formats = FORMATS;
  protected readonly format = signal<TournamentFormat>('RoundRobin');
  protected readonly swissRoundOptions = SWISS_ROUND_CHOICES;
  protected readonly swissRoundOption = signal<SwissRoundOption>('UntilWinner');
  /** Whether setup gives the tournament public decklists: off unless the organizer chooses them. */
  protected readonly publicDecklists = signal(false);
  /** The format and round count, summed up. */
  protected readonly summary = computed(() => {
    const tournament = this.tournament();
    return tournament ? summaryOf(tournament) : '';
  });
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
  /**
   * Join is offered where the api says joining would let the viewer in
   * (ADR 0003): to the draft's human players during registration who
   * haven't joined, and whose deck is big enough.
   */
  protected readonly offerJoin = computed(() => !!this.tournament()?.canJoin);
  /** Why the viewer can't join for now, said in place of Join: their deck is too small. */
  protected readonly deckTooSmall = computed(() => {
    const refusal = this.tournament()?.joinRefusal;
    return refusal?.error === 'deck-too-small' ? refusal.message : null;
  });
  protected readonly offerLeave = computed(() => this.state() === 'Registration' && this.joined());
  /** Organizers may remove joined players, start and cancel the tournament during registration. */
  protected readonly offerOrganize = computed(
    () => this.canOrganize() && this.state() === 'Registration',
  );
  /** Start needs at least 2 joined players. */
  protected readonly canStart = computed(() => this.entries().length >= 2);
  /**
   * Organizers drop and reinstate players, and complete or cancel the
   * tournament, while it is playing.
   */
  protected readonly organizePlay = computed(
    () => this.canOrganize() && this.state() === 'Playing',
  );
  /** The game scores a player reports, from their side. */
  protected readonly ownGameScores = OWN_GAME_SCORES;
  /** Whether a correction or clear can clear later matches, as the read says, so the api previews it first. */
  private readonly previewsCorrections = computed(() => !!this.tournament()?.previewsCorrections);
  /** The Complete round dialog, while it's open. */
  private completing: DialogRef<CompleteRoundRequest, CompleteRoundDialog> | null = null;

  /** The match the signed-in player chose to report from the tournament rounds, if any. */
  protected readonly chosen = signal<string | undefined>(undefined);
  /**
   * Whether the signed-in player plays on: they joined and haven't dropped,
   * while the tournament is playing. Then "Your match" shows, and Drop.
   */
  protected readonly playsOn = computed(
    () => this.state() === 'Playing' && this.joined() && !this.ownDropped(),
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
  /**
   * The signed-in player's match shown at the top: the one they chose, while
   * it is unreported, else their first unreported match by tournament round.
   */
  protected readonly ownMatch = computed(() => {
    const ownId = this.ownId();
    if (!ownId || !this.playsOn()) return undefined;
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

  constructor() {
    // Complete round stops being offered once the tournament isn't playing,
    // as when another organizer completes it: close its dialog then.
    effect(() => {
      if (!this.organizePlay()) untracked(() => this.completing?.close());
    });
  }

  /** Sets up the tournament in the format, for Swiss the round option, and with or without public decklists, as chosen. */
  protected setUpTournament() {
    const format = this.format();
    const publicDecklists = this.publicDecklists();
    const setup: TournamentSetupRequest =
      format === 'Swiss'
        ? { format, swissRoundOption: this.swissRoundOption(), publicDecklists }
        : { format, publicDecklists };
    return this.send(() => this.api.setUp(this.draft().id, setup), {
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
        confirm(START_QUESTIONS[this.tournament()?.format ?? 'RoundRobin'])
          ? this.api.start(this.draft().id)
          : undefined,
      { failure: "Couldn't start the tournament. Try again in a moment." },
    );
  }

  /** Reports the signed-in player's match at `score`, from their side, once they confirm. */
  protected report(match: MatchView, opponent: string, { own, theirs }: OwnGameScore) {
    const games: GameScore = match.players[0] === this.ownId() ? [own, theirs] : [theirs, own];
    return this.send(
      () =>
        confirm(
          `Report that you ${own > theirs ? 'won' : 'lost'} ${own}–${theirs} against ${opponent}? Only an organizer can change a reported match.`,
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
          'Drop from the tournament? Your unplayed matches become forfeits, and only an organizer can reinstate you. Your deck stays locked until the tournament is complete or cancelled.',
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

  /** Reinstates the dropped player `playerId`; for organizers. */
  protected reinstate(playerId: string) {
    return this.send(() => this.api.reinstate(this.draft().id, playerId), {
      failure: "Couldn't reinstate the player. Try again in a moment.",
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

  /**
   * Opens the Complete round dialog for the tournament's current tournament
   * round, in Swiss or single elimination. Once it has sent, a refusal is said here, where focus
   * returns: to the button that opened it.
   */
  protected openCompleteRound() {
    const completing = this.dialogs.open<CompleteRoundDialog, CompleteRoundRequest>(
      CompleteRoundDialog,
      { labelledBy: COMPLETE_ROUND_HEADING, injector: this.injector },
    );
    this.completing = completing;
    completing.closed.subscribe((request) => {
      this.completing = null;
      if (request) void this.completeRound(request);
    });
  }

  /** Completes the tournament's current tournament round as the Complete round dialog chose. */
  private completeRound(request: CompleteRoundRequest) {
    return this.send(() => this.api.completeRound(this.draft().id, request), {
      failure: "Couldn't complete the tournament round. Try again in a moment.",
    });
  }

  /** Cancels the tournament, in registration or being played, once the organizer confirms. */
  protected cancel() {
    const question =
      this.state() === 'Playing'
        ? 'Cancel the tournament? Its matches are removed, nothing from it counts, and every deck unlocks.'
        : 'Cancel the tournament? Everyone who joined is taken out of it, and their decks unlock.';
    return this.send(() => (confirm(question) ? this.api.cancel(this.draft().id) : undefined), {
      failure: "Couldn't cancel the tournament. Try again in a moment.",
      keep: ['set-up'],
    });
  }

  /** Confirms the signed-in player's match `matchId`. */
  protected confirmMatch(matchId: string) {
    return this.send(() => this.api.confirm(this.draft().id, matchId), {
      failure: "Couldn't confirm the match. Try again in a moment.",
    });
  }

  /**
   * Sets a match's game score, as an organizer reports or corrects it, once
   * they go ahead with the later matches it clears, if any.
   */
  protected setGameScore({ matchId, games }: SetGameScore) {
    const correct = () => this.api.setGameScore(this.draft().id, matchId, games);
    const warning = { question: `Correct ${this.matchLabel(matchId)}?`, detail: null };
    return this.send(
      () =>
        this.previewsCorrections()
          ? this.goesAhead(matchId, games, { ...warning, action: 'Correct' }, () => true).then(
              (goAhead) => (goAhead ? correct() : undefined),
            )
          : correct(),
      {
        failure: "Couldn't save the match’s game score. Try again in a moment.",
        keep: [`correct ${matchId}`],
      },
    );
  }

  /**
   * Clears a match's game score, once the organizer confirms, or goes ahead
   * with the later matches it clears, if any.
   */
  protected clearGameScore({ matchId, label, after }: ClearGameScore) {
    const clear = () => this.api.clearGameScore(this.draft().id, matchId);
    const question = `Clear the game score of ${label}?`;
    const confirmed = () => confirm(`${question} ${after}`);
    return this.send(
      () =>
        this.previewsCorrections()
          ? this.goesAhead(
              matchId,
              null,
              { question, detail: after, action: 'Clear' },
              confirmed,
            ).then((goAhead) => (goAhead ? clear() : undefined))
          : confirmed()
            ? clear()
            : undefined,
      {
        failure: "Couldn't clear the match’s game score. Try again in a moment.",
        keep: [`correct ${matchId}`],
      },
    );
  }

  /**
   * Whether the organizer goes ahead with setting the match `matchId`'s
   * game score to `games`, or clearing it when null: asks the api what it
   * would do, and if it clears anything or changes the tournament's state,
   * shows the correction warning; else asks `askUnwarned`.
   */
  private async goesAhead(
    matchId: string,
    games: GameScore | null,
    warning: Omit<CorrectionWarning, 'preview'>,
    askUnwarned: () => boolean,
  ): Promise<boolean> {
    const preview = await firstValueFrom(
      this.api.previewCorrection(this.draft().id, matchId, games),
    );
    const quiet = preview.clears.length === 0 && preview.state === this.state();
    return quiet ? askUnwarned() : this.warned({ ...warning, preview });
  }

  /** Shows the correction warning, and answers whether the organizer goes ahead. */
  private async warned(warning: CorrectionWarning): Promise<boolean> {
    const ref = this.dialogs.open<CorrectionWarningDialog, boolean>(CorrectionWarningDialog, {
      labelledBy: CORRECTION_WARNING_HEADING,
      injector: this.injector,
      bindings: [inputBinding('warning', () => warning)],
    });
    return (await firstValueFrom(ref.closed)) === true;
  }

  /** How the match `matchId` reads, such as "Bob vs Carol". */
  private matchLabel(matchId: string) {
    const match = this.tournament()
      ?.rounds.flatMap((round) => round.matches)
      .find((m) => m.id === matchId);
    return versus((match?.players ?? []).map((id) => this.store.player(id).name));
  }

  /**
   * Sends a change to the tournament, the request `send` makes, and shows
   * the draft it answers with, unless another change is in flight; `send`
   * makes none if the organizer thinks better of it, and may first ask the
   * api what it would do. A refusal's reason, or else `failure`, is shown
   * if it fails.
   */
  private send(
    send: () => Observable<DraftView> | undefined | Promise<Observable<DraftView> | undefined>,
    { failure, keep }: { failure: string; keep?: string[] },
  ) {
    return this.changes.send(
      async () => {
        try {
          const request = await send();
          if (!request) return;
          this.error.set(null);
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
