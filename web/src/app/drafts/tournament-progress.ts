import { ChangeDetectionStrategy, Component, computed, input, linkedSignal } from '@angular/core';
import type { TournamentState, TournamentView } from 'contract';

/** A tournament's states, in the order it goes through them. */
const STATES: TournamentState[] = ['Registration', 'Playing', 'Complete'];

/** What a step's hidden text adds to its state's name, by where it stands. */
const HIDDEN_STEP_TEXT = { completed: ', completed', current: '', upcoming: ', not completed' };

/** Single elimination's last tournament rounds by name, from the final back, as far as the bracket has them. */
const NAMED_ROUNDS = ['Final', 'Semifinal', 'Quarterfinal'];

/**
 * The tournament round being played, the one after the last completed, as
 * "Tournament round 2 of 3"; in single elimination, the last three by name,
 * such as "Semifinal".
 */
function openRound({ format, lastCompletedRound, roundCount }: TournamentView): string {
  const round = Math.min(lastCompletedRound + 1, roundCount);
  const named = format === 'SingleElimination' ? NAMED_ROUNDS[roundCount - round] : undefined;
  return named ?? `Tournament round ${round} of ${roundCount}`;
}

/** `count` matches, "1 match" in the singular. */
const matches = (count: number) => `${count} ${count === 1 ? 'match' : 'matches'}`;

/**
 * Round robin's matches left, which have no game score yet: the signed-in
 * player's, while they play on (`ownId`) and have some, else the
 * tournament's, else that all are reported.
 */
function matchesLeft({ rounds }: TournamentView, ownId: string | undefined): string {
  const left = rounds
    .flatMap((round) => round.matches)
    .filter((match) => match.outcome.kind === 'Unreported');
  const own = ownId ? left.filter((match) => match.players.includes(ownId)).length : 0;
  if (own) return `You have ${matches(own)} left`;
  if (left.length) return `${matches(left.length)} left in the tournament`;
  return 'All matches reported';
}

/**
 * Where the tournament stands while it is playing, for the signed-in player
 * who plays on (`ownId`), if any; null in registration and once it is
 * complete.
 */
function progressOf(tournament: TournamentView, ownId: string | undefined): string | null {
  if (tournament.state !== 'Playing') return null;
  return tournament.format === 'RoundRobin'
    ? matchesLeft(tournament, ownId)
    : openRound(tournament);
}

/** The tournament's state, and in Swiss and single elimination the tournament round being played. */
interface Milestone {
  state: TournamentState;
  round: string | null;
}

/**
 * Where a tournament stands, at the top of the Play tab: its states in
 * order, the current one marked, earlier ones completed. Static: the steps
 * aren't links or buttons. While it is playing, a progress line under
 * them says how far it has got. A change of state, or a new tournament
 * round in Swiss and single elimination, is announced politely; round
 * robin's matches left, which change with every report, aren't.
 */
@Component({
  selector: 'app-tournament-progress',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tournament-progress.html',
  styleUrls: ['./tournament-progress.scss'],
})
export class TournamentProgress {
  readonly tournament = input.required<TournamentView>();
  /** The signed-in player's id while they play on: joined and not dropped. */
  readonly ownId = input<string>();

  /**
   * Each state, with whether it is completed, current or still to come,
   * and the hidden text that says so; aria-current says it of the current one.
   */
  protected readonly steps = computed(() => {
    const current = STATES.indexOf(this.tournament().state);
    return STATES.map((state, i) => {
      const step = i < current ? 'completed' : i === current ? 'current' : 'upcoming';
      return { state, step, hidden: HIDDEN_STEP_TEXT[step] };
    });
  });
  /** Where the tournament stands while it is playing; null otherwise. */
  protected readonly progress = computed(() => progressOf(this.tournament(), this.ownId()));

  /** What is announced when it changes: the state, and the tournament round being played. */
  private readonly milestone = computed<Milestone>(
    () => {
      const tournament = this.tournament();
      const rounds = tournament.state === 'Playing' && tournament.format !== 'RoundRobin';
      return { state: tournament.state, round: rounds ? openRound(tournament) : null };
    },
    { equal: (a, b) => a.state === b.state && a.round === b.round },
  );
  /** The last change of milestone, announced; nothing as the tab opens. */
  protected readonly announcement = linkedSignal<Milestone, string>({
    source: this.milestone,
    computation: (now, previous) => {
      if (!previous) return '';
      if (now.state !== previous.source.state) return `Tournament: ${now.state}`;
      return now.round ?? '';
    },
  });
}
