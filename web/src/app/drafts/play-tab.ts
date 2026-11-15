import type { DialogRef } from '@angular/cdk/dialog';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  Injector,
  inputBinding,
  signal,
  untracked,
} from '@angular/core';
import { LucideArrowLeftRight, LucideCheck } from '@lucide/angular';
import {
  SWISS_ROUND_OPTIONS,
  TOURNAMENT_FORMAT_NAMES,
  type CompleteRoundRequest,
  type DraftView,
  type ReopenRoundView,
  type MatchView,
  MIN_TOURNAMENT_PLAYERS,
  type SwissRoundOption,
  type TournamentFormat,
  type TournamentSetupRequest,
} from 'contract';
import type { Observable } from 'rxjs';
import { DialogShell } from '../dialog-shell';
import { formatName, summaryOf, SWISS_ROUND_OPTION_NAMES } from './tournament-format-names';
import { Questions, type Question } from '../question-dialog';
import { LoadingAnimation } from '../loading/loading-animation';
import { ChangeStatus, Changes, SendsChange } from '../changes';
import { COMPLETE_ROUND_HEADING, CompleteRoundDialog } from './complete-round-dialog';
import { DeckLockReminder } from './deck-lock-reminder';
import { DraftStore } from './draft-store';
import { changeFailure, isRefusal } from './drafts';
import { PlayerAvatar } from './player-avatar';
import { TournamentApi } from './tournament-api';
import { TournamentProgress } from './tournament-progress';
import { ResultsGrid } from './results-grid';
import type { ClearGameScore } from './match-lines';
import { TournamentResults, type SetGameScore } from './tournament-results';
import {
  inMatchOrder,
  REPORT_DETAIL,
  reportQuestion,
  YourMatches,
  type OwnMatch,
  type OwnReport,
} from './your-matches';

/** The formats tournament setup offers, in order, as it names them. */
const FORMATS = (Object.keys(TOURNAMENT_FORMAT_NAMES) as TournamentFormat[]).map((format) => ({
  format,
  name: formatName(format),
}));

/** The Swiss round options tournament setup offers, in order, as it names them. */
const SWISS_ROUND_CHOICES = SWISS_ROUND_OPTIONS.map((option) => ({
  option,
  ...SWISS_ROUND_OPTION_NAMES[option],
}));

/** What starting the tournament does, by format, as Start's question says it. */
const START_DETAILS: Record<TournamentFormat, string> = {
  RoundRobin: 'Joining closes, and every match opens.',
  Swiss: 'Joining closes, and tournament round 1 is paired at random.',
  SingleElimination:
    'Joining closes, the players are seeded at random into the bracket, and tournament round 1 opens.',
};

/**
 * Where a failed change is explained, by the controls that made it:
 * directly after the action rows during play, for Drop from tournament
 * and the organizer's Cancel tournament, Reopen round, Complete round and
 * Complete tournament; directly after Your matches, for Report and Confirm
 * there; directly after the results (standings and matches, bracket or
 * results grid), for Confirm and game score changes there; or at the foot
 * of the tab, for everything else, and for a failure whose section the tab
 * no longer shows. So `actions` falls back to the foot whenever the action
 * rows aren't shown, as for Cancel tournament during registration.
 */
type ErrorPlace = 'actions' | 'yourMatches' | 'results' | 'foot';

/**
 * The Play tab of a complete draft: the setup form for organizers
 * before its tournament is set up, then registration, where the draft's
 * players join and leave and organizers remove them, start it or cancel
 * it, then play. Play shows the summary and the trophy, then the action
 * rows, before every list that grows: Drop from tournament, and for
 * organizers Cancel tournament, Reopen round of the last completed
 * tournament round, and Complete tournament (round robin) or Complete round
 * (Swiss, whose dialog grants draws in unreported matches, and single
 * elimination, whose dialog picks their winners). In Swiss and single
 * elimination it then shows the signed-in player's match to report or
 * confirm, then the standings and matches; in round robin, which has no
 * tournament rounds, Your matches and the results grid. Then come the
 * players, with Drop and Reinstate for organizers.
 */
@Component({
  selector: 'app-play-tab',
  imports: [
    ChangeStatus,
    DeckLockReminder,
    LoadingAnimation,
    LucideArrowLeftRight,
    LucideCheck,
    PlayerAvatar,
    SendsChange,
    ResultsGrid,
    TournamentProgress,
    TournamentResults,
    YourMatches,
  ],
  providers: [Changes],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './play-tab.html',
  styleUrls: ['../page.scss', './drafts.scss', './draft-panels.scss', './play-tab.scss'],
})
export class PlayTab {
  private readonly api = inject(TournamentApi);
  private readonly changes = inject(Changes);
  private readonly store = inject(DraftStore);
  private readonly dialogs = inject(DialogShell);
  private readonly questions = inject(Questions);
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
  /** The Decklists toggle's value: Public with public decklists, Private without. */
  protected readonly decklistsName = computed(() =>
    this.publicDecklists() ? 'Public' : 'Private',
  );
  /** The format and round count, summed up; read only once the tournament has loaded. */
  protected readonly summary = computed(() => summaryOf(this.tournament()!));
  /** The latest change's failure, if it failed, and where it is explained; only one shows at a time. */
  protected readonly error = signal<{ message: string; place: ErrorPlace } | null>(null);

  /** Whether the draft has a tournament; before then organizers see the setup form. */
  protected readonly setUp = computed(() => !!this.draft().tournament);
  /**
   * The joined players, in join order, as the draft names them, with
   * whether each can be removed and is ready; read only once the tournament
   * has loaded.
   */
  protected readonly entries = computed(() =>
    this.tournament()!.entries.map((entry) => ({
      ...this.store.player(entry.playerId),
      droppable: entry.droppable,
      ready: entry.ready,
    })),
  );
  /** Whether the signed-in player is ready; read only once the tournament has loaded. */
  protected readonly ownReady = computed(
    () => !!this.entries().find((entry) => entry.id === this.ownId())?.ready,
  );
  /** The signed-in player's id, if they are one of the draft's players. */
  protected readonly ownId = computed(() => this.store.ownPlayer()?.id);
  /** Whether the signed-in player has joined. */
  protected readonly joined = this.store.joinedTournament;
  /**
   * Join is offered where the api says joining would let the viewer in
   * (ADR 0003): to the draft's human players during registration who have
   * left or been removed, as setup joins everyone.
   */
  // Stryker disable next-line OptionalChaining: read only once the tournament has loaded.
  protected readonly offerJoin = computed(() => !!this.tournament()?.canJoin);
  /** Leave is offered to a player who joined; read only during registration. */
  protected readonly offerLeave = this.joined;
  /** Organizers may remove joined players, start and cancel the tournament; read only during registration. */
  protected readonly offerOrganize = this.canOrganize;
  /** Start needs MIN_TOURNAMENT_PLAYERS joined, as the api refuses it with fewer. */
  protected readonly canStart = computed(() => this.entries().length >= MIN_TOURNAMENT_PLAYERS);
  /**
   * Organizers drop and reinstate players, and complete or cancel the
   * tournament, while it is playing.
   */
  protected readonly organizePlay = computed(
    () => this.canOrganize() && this.state() === 'Playing',
  );
  /**
   * Reopen round of the last completed tournament round, offered to
   * organizers while the tournament is playing where the read offers it,
   * with why the api would refuse it, if it would; null otherwise.
   */
  protected readonly offeredReopenRound = computed(() =>
    // Stryker disable next-line OptionalChaining: organizePlay needs a loaded tournament.
    this.organizePlay() ? (this.tournament()?.reopenRound ?? null) : null,
  );
  /** The Complete round dialog, while it's open. */
  private completing: DialogRef<CompleteRoundRequest, CompleteRoundDialog> | null = null;
  /** The tournament's current tournament round: the one after the last completed. */
  private readonly currentRound = computed(() => (this.tournament()?.lastCompletedRound ?? 0) + 1);

  /** The match the signed-in player chose to report from the tournament rounds, if any. */
  protected readonly chosen = signal<string | undefined>(undefined);
  /**
   * Whether the signed-in player plays on: they joined and haven't dropped,
   * while the tournament is playing. Then "Your match" shows, and Drop.
   */
  protected readonly playsOn = computed(
    () => this.state() === 'Playing' && this.joined() && !this.ownDropped(),
  );
  /**
   * The joined players once the tournament is playing, in join order, with
   * whether each dropped and can be, and why the api would refuse
   * reinstating them, if it would.
   */
  protected readonly players = computed(() =>
    this.tournament()!.entries.map((entry) => ({
      ...this.store.player(entry.playerId),
      dropped: entry.dropped,
      droppable: entry.droppable,
      reinstateRefusal: entry.reinstateRefusal,
    })),
  );
  /** Whether the signed-in player joined and has dropped. */
  private readonly ownDropped = computed(
    // Stryker disable next-line OptionalChaining: read only from playsOn, once playing and joined, so the tournament holds the viewer's entry.
    () => !!this.tournament()?.entries.find((entry) => entry.playerId === this.ownId())?.dropped,
  );
  /** The signed-in player's matches, each with its tournament round, in tournament round order. */
  private readonly mine = computed((): OwnMatch[] => {
    const ownId = this.ownId();
    return this.tournament()!.rounds.flatMap(({ round, matches }) =>
      matches.filter((match) => match.players.includes(ownId!)).map((match) => ({ round, match })),
    );
  });
  /**
   * The signed-in player's match "Your match" shows, in Swiss and single
   * elimination: the one they chose, while they may report it, else their
   * first match by tournament round that they may report or confirm, as
   * the api says.
   */
  protected readonly ownMatch = computed((): OwnMatch | undefined => {
    const ownId = this.ownId();
    if (!ownId || !this.playsOn()) return undefined;
    const reportable = (match: MatchView) => match.reportableBy.includes(ownId);
    const mine = this.mine();
    return (
      mine.find(({ match }) => match.id === this.chosen() && reportable(match)) ??
      mine.find(({ match }) => reportable(match) || match.confirmableBy.includes(ownId))
    );
  });
  /** Whether the tournament is round robin, which has no tournament rounds: Your matches and the results grid show its matches. */
  // Stryker disable next-line OptionalChaining: read only once the tournament has loaded.
  protected readonly roundRobin = computed(() => this.tournament()?.format === 'RoundRobin');
  /**
   * Whether the signed-in player's own matches show, once the tournament
   * has started, the only time it is read: round robin's Your matches for
   * a player who joined, so they still see their results once they have
   * dropped or it is complete, and can confirm one while it is playing;
   * "Your match" for one who plays on.
   */
  private readonly showsOwnMatches = computed(() =>
    this.roundRobin() ? this.joined() : this.playsOn(),
  );
  /**
   * Whether the tab shows the tournament played or complete, with its
   * results; not before setup, while loading, or in registration. The
   * template shows the results section by it, and `errorPlace` places
   * failures by it, so the two can't disagree.
   */
  protected readonly showsResults = computed(
    () =>
      this.setUp() &&
      !this.read.missing() &&
      !!this.tournament() &&
      this.tournament()!.state !== 'Registration',
  );
  /** Whether the tab shows Your matches (or "Your match"), in the results section. */
  protected readonly showsYourMatches = computed(
    () => this.showsResults() && this.showsOwnMatches(),
  );
  /** Where the failure shows: its own place while the tab shows that section, else the foot, so it is never lost. */
  private readonly errorPlace = computed((): ErrorPlace | null => {
    const place = this.error()?.place;
    if (!place) return null;
    const shown: Record<ErrorPlace, boolean> = {
      actions: this.playsOn() || this.organizePlay(),
      yourMatches: this.showsYourMatches(),
      results: this.showsResults(),
      foot: true,
    };
    return shown[place] ? place : 'foot';
  });
  /** The signed-in player's matches their own matches show: all of them in round robin, else "Your match"'s, if any. */
  protected readonly ownMatches = computed((): OwnMatch[] => {
    if (this.roundRobin()) return this.mine();
    const own = this.ownMatch();
    return own ? [own] : [];
  });
  /** The players who hold the trophy, as the draft names them. */
  protected readonly trophyHolders = computed(() =>
    this.tournament()!.trophyHolders.map((id) => this.store.player(id)),
  );

  constructor() {
    // Close the Complete round dialog, sending nothing, once it is stale,
    // as it is once either of these changes, the only times the effect
    // re-runs: Complete round stops being offered once the tournament isn't
    // playing, as when another organizer completes or cancels it, and the
    // dialog's tournament round stops being current once another organizer
    // completes or reopens a tournament round.
    effect(() => {
      this.organizePlay();
      this.currentRound();
      untracked(() => this.completing?.close());
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

  /**
   * Marks the signed-in player ready, or unmarks them if they are. A
   * refusal re-reads the tournament, as their deck may have changed where
   * this page didn't see it, so I'm ready shows as the api now allows it.
   */
  protected toggleReady() {
    return this.send(() => this.api.setReady(this.draft().id, !this.ownReady()), {
      failure: "Couldn't change whether you're ready. Try again in a moment.",
      refused: () => this.store.rereadTournament(),
    });
  }

  protected remove(playerId: string) {
    return this.send(() => this.api.removeEntry(this.draft().id, playerId), {
      failure: "Couldn't remove the player. Try again in a moment.",
    });
  }

  /** Starts the tournament, once the organizer goes ahead. */
  protected start() {
    return this.send(
      async () =>
        (await this.ask({
          question: 'Start the tournament?',
          detail: START_DETAILS[this.tournament()!.format],
          action: 'Start',
        }))
          ? this.api.start(this.draft().id)
          : undefined,
      { failure: "Couldn't start the tournament. Try again in a moment." },
    );
  }

  /**
   * Reports the signed-in player's match at `score`, from their side, once
   * they go ahead: asking them first, unless they were `asked` already.
   */
  protected report({ match, opponent, score, asked }: OwnReport) {
    const games = inMatchOrder(match, this.ownId()!, score);
    return this.send(
      async () =>
        asked ||
        (await this.ask({
          question: reportQuestion(score, opponent),
          detail: REPORT_DETAIL,
          action: 'Report',
        }))
          ? this.api.report(this.draft().id, match.id, games)
          : undefined,
      { failure: "Couldn't report the match. Try again in a moment.", place: 'yourMatches' },
    );
  }

  /** Drops the signed-in player from the tournament, once they go ahead. */
  protected dropSelf() {
    return this.send(
      async () =>
        (await this.ask({
          question: 'Drop from the tournament?',
          detail:
            'Your unplayed matches become forfeits, and only an organizer can reinstate you. Your deck stays locked until the tournament is complete or cancelled.',
          action: 'Drop',
        }))
          ? this.api.drop(this.draft().id, this.ownId()!)
          : undefined,
      { failure: "Couldn't drop from the tournament. Try again in a moment.", place: 'actions' },
    );
  }

  /** Drops the player `playerId`, named `name`, once the organizer goes ahead. */
  protected drop(playerId: string, name: string) {
    return this.send(
      async () =>
        (await this.ask({
          question: `Drop ${name} from the tournament?`,
          detail: 'Their unplayed matches become forfeits.',
          action: 'Drop',
        }))
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

  /** Completes the tournament, once the organizer goes ahead. */
  protected complete() {
    return this.send(
      async () =>
        (await this.ask({
          question: 'Complete the tournament?',
          detail: 'Its unreported matches become granted draws, and the trophy is awarded.',
          action: 'Complete tournament',
        }))
          ? this.api.complete(this.draft().id)
          : undefined,
      {
        failure: "Couldn't complete the tournament. Try again in a moment.",
        place: 'actions',
      },
    );
  }

  /**
   * Opens the Complete round dialog for the tournament's current tournament
   * round, in Swiss or single elimination. Once it has sent, a refusal is said here, where focus
   * returns: to the button that opened it.
   */
  protected openCompleteRound() {
    const round = this.currentRound();
    const completing = this.dialogs.open<CompleteRoundDialog, CompleteRoundRequest>(
      CompleteRoundDialog,
      {
        labelledBy: COMPLETE_ROUND_HEADING,
        injector: this.injector,
        bindings: [inputBinding('round', () => round)],
      },
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
      place: 'actions',
    });
  }

  /** Cancels the tournament, in registration or being played, once the organizer goes ahead. */
  protected cancel() {
    const detail =
      this.state() === 'Playing'
        ? 'Its matches are removed, nothing from it counts, and every deck unlocks.'
        : 'Everyone who joined is taken out of it, and their decks unlock.';
    const question = {
      question: 'Cancel the tournament?',
      detail,
      action: 'Cancel tournament',
      dismiss: 'Keep tournament',
    };
    return this.send(
      async () => ((await this.ask(question)) ? this.api.cancel(this.draft().id) : undefined),
      {
        failure: "Couldn't cancel the tournament. Try again in a moment.",
        keep: ['set-up'],
        // During play, by the action rows; in registration, where they aren't shown, at the foot.
        place: 'actions',
      },
    );
  }

  /** Confirms the signed-in player's match `matchId`, pressed at `place`: Your matches or the results. */
  protected confirmMatch(matchId: string, place: ErrorPlace) {
    return this.send(() => this.api.confirm(this.draft().id, matchId), {
      failure: "Couldn't confirm the match. Try again in a moment.",
      place,
    });
  }

  /** Sets a match's game score, as an organizer reports or corrects it. */
  protected setGameScore({ matchId, games }: SetGameScore) {
    return this.send(() => this.api.setGameScore(this.draft().id, matchId, games), {
      failure: "Couldn't save the match’s game score. Try again in a moment.",
      keep: [`correct ${matchId}`],
      place: 'results',
    });
  }

  /** Clears a match's game score, once the organizer goes ahead. */
  protected clearGameScore({ matchId, label, after }: ClearGameScore) {
    const question = {
      question: `Clear the game score of ${label}?`,
      detail: after,
      action: 'Clear',
    };
    return this.send(
      async () =>
        (await this.ask(question)) ? this.api.clearGameScore(this.draft().id, matchId) : undefined,
      {
        failure: "Couldn't clear the match’s game score. Try again in a moment.",
        keep: [`correct ${matchId}`],
        place: 'results',
      },
    );
  }

  /**
   * Reopens the last completed tournament round, `offered` as the read
   * offers Reopen round, once the organizer goes ahead with what it takes
   * back.
   */
  protected reopenRound(offered: ReopenRoundView) {
    const question = {
      question: `Reopen tournament round ${offered.round}?`,
      detail: reopenRoundDetail(offered, (id) => this.store.player(id).name),
      action: `Reopen round ${offered.round}`,
    };
    return this.send(
      async () => ((await this.ask(question)) ? this.api.reopenRound(this.draft().id) : undefined),
      {
        failure: "Couldn't reopen the tournament round. Try again in a moment.",
        place: 'actions',
      },
    );
  }

  /** The failure's message if it shows at `place`, else null. */
  protected errorAt(place: ErrorPlace) {
    return this.errorPlace() === place ? this.error()!.message : null;
  }

  /** Asks `question` in the question dialog, and answers whether the viewer goes ahead. */
  private ask(question: Question) {
    return this.questions.ask(question, this.injector);
  }

  /**
   * Sends a change to the tournament, the request `send` makes, and shows
   * the draft it answers with, unless another change is in flight; `send`
   * makes none if the organizer thinks better of it. A refusal's reason, or else `failure`, is shown
   * at `place`, the foot of the tab unless given, if it fails, and `refused`, if any, runs on a refusal.
   */
  private send(
    send: () => Observable<DraftView> | undefined | Promise<Observable<DraftView> | undefined>,
    {
      failure,
      keep,
      refused,
      place = 'foot',
    }: { failure: string; keep?: string[]; refused?: () => void; place?: ErrorPlace },
  ) {
    return this.changes.send(
      async () => {
        try {
          const request = await send();
          if (!request) return;
          this.error.set(null);
          await this.store.changeDraft(request);
          // Settle once the page shows the re-read tournament, so focus is put back among the controls it shows.
          await this.store.whenTournamentSettled();
          // Stryker disable next-line BooleanLiteral: Changes.send uses the answer only for an empty status and busyOnceMade, which the Play tab never passes.
          return true;
        } catch (err) {
          if (isRefusal(err)) refused?.();
          this.error.set({ message: changeFailure(err, failure), place });
          // Stryker disable next-line BooleanLiteral: Changes.send uses the answer only for an empty status and busyOnceMade, which the Play tab never passes.
          return false;
        }
      },
      { keep },
    );
  }
}

/** Names joined as a sentence lists them, such as "Alice, Bob, and Carol". */
// Stryker disable next-line ObjectLiteral: conjunction is Intl.ListFormat's default type, so `{}` lists names the same.
const NAMES = new Intl.ListFormat('en', { type: 'conjunction' });

/**
 * What reopening a tournament round does, as its question says it:
 * its results will be open to correction again and will leave the
 * standings, the next round's pairings will be removed, and the drops it
 * takes back, named by `name`, will be undone.
 */
function reopenRoundDetail(
  { round, takesBackDrops }: ReopenRoundView,
  name: (id: string) => string,
) {
  const names = takesBackDrops.map(name);
  const back =
    names.length === 0
      ? ''
      : ` ${NAMES.format(names)} will be back in the tournament, with ${names.length === 1 ? 'their drop' : 'their drops'} taken back.`;
  return `Its results will be open to correction again, and will leave the standings until it is completed again. Reopening it will remove tournament round ${round + 1}’s pairings, to be paired again then.${back}`;
}
