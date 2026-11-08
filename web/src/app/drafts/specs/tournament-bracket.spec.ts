import type { PlayerView, UserView, ViewerTournamentView } from 'contract';
import {
  ORGANIZE_ONLY,
  alice,
  alicePlayer,
  bob,
  button,
  group,
  text,
  useDraftsApp,
} from './harness';
import {
  answerChange,
  bobUser,
  bracket,
  bracketMatches,
  carol,
  carolBeatBob,
  carolUser,
  dave,
  drawnPlaces,
  drawnSides,
  firstBracketRound,
  unreportedMatch,
  openPlaying,
  ownPath,
  place,
  roundLabels,
  side,
  singleEliminationFinal as final,
  standing,
  singleEliminationPlaying,
  pushTournament,
  threePlayers,
  winnerToCome,
} from './play-tab-harness';

useDraftsApp();

/** Carol having beaten Bob 2–1 in round 1, confirmed, which isn't completed yet, so the final isn't paired. */
const carolWon = singleEliminationPlaying({
  rounds: [carolBeatBob({ confirmed: true })],
  bracket: [
    firstBracketRound(carol.id),
    { round: 2, places: [place(0, null, [side(alice.id), side(carol.id)])] },
  ],
});

/** Carol's report of beating Bob 2–1, unconfirmed in an open round, so not yet agreed. */
const carolReported = singleEliminationPlaying({
  rounds: [carolBeatBob()],
  bracket: [
    firstBracketRound(),
    { round: 2, places: [place(0, null, [side(alice.id), winnerToCome(1)])] },
  ],
});

/** How the bracket starts telling the signed-in player who they face next. */
const YOUR_NEXT_MATCH = 'Your next match';

/** Bob and Carol's match of round 1, as the bracket draws it once Carol has beaten Bob 2–1. */
const CAROL_BEAT_BOB_DRAWN = ['2 Bob 1', '3 Carol 2'];

describe('the bracket of a single elimination tournament', () => {
  it('draws each tournament round with every match’s players, seeds and game score, and the byes', async () => {
    const { tab } = await openPlaying(final, { user: dave });

    expect(text(tab)).toContain('Single elimination: 2 tournament rounds');
    expect(bracket(tab)).not.toBeNull();
    expect(roundLabels(tab)).toEqual(['Semifinal', 'Final']);
    expect(bracketMatches(tab, 1)).toEqual([
      'Alice (seed 1) has a bye',
      'Bob (seed 2) 1–2 Carol (seed 3) · Carol won',
    ]);
    expect(bracketMatches(tab, 2)).toEqual(['Alice (seed 1) vs Carol (seed 3) · Unreported']);
  });

  it('draws each side’s seed, name and games won, and the note under each match', async () => {
    const { tab } = await openPlaying(final, { user: dave });

    expect(drawnPlaces(tab, 1)).toEqual([['1 Alice', 'Bye'], CAROL_BEAT_BOB_DRAWN]);
    expect(drawnPlaces(tab, 2)).toEqual([['1 Alice', '3 Carol', 'Unreported']]);
  });

  it('draws a side still to be decided by the match that decides it', async () => {
    const { tab } = await openPlaying(singleEliminationPlaying(), { user: dave });

    expect(drawnPlaces(tab, 2)).toEqual([['1 Alice', 'Winner of Bob vs Carol']]);
  });

  it('shows a confirmed match as confirmed, drawn and named', async () => {
    const { tab } = await openPlaying(carolWon, { user: dave });

    expect(drawnPlaces(tab, 1)[1]).toEqual([...CAROL_BEAT_BOB_DRAWN, 'Confirmed']);
    expect(bracketMatches(tab, 1)[1]).toBe(
      'Bob (seed 2) 1–2 Carol (seed 3) · Carol won · Confirmed',
    );
  });

  it('draws the sides that advanced apart from those that aren’t players yet', async () => {
    const { fixture, tab } = await openPlaying(singleEliminationPlaying(), { user: dave });

    expect(drawnSides(tab, 'won')).toEqual(['1 Alice']);
    expect(drawnSides(tab, 'not-player')).toEqual(['Bye', 'Winner of Bob vs Carol']);

    await pushTournament(fixture, final, 2);

    expect(drawnSides(tab, 'won')).toEqual(['1 Alice', '3 Carol 2']);
    expect(drawnSides(tab, 'not-player')).toEqual(['Bye']);
  });

  it('shows a match decided without a game score by how it was decided', async () => {
    const { tab } = await openPlaying(
      singleEliminationPlaying({
        rounds: [
          {
            round: 1,
            correctable: true,
            matches: [
              {
                ...unreportedMatch('m1', bob.id, carol.id),
                bracketPlace: 1,
                outcome: { kind: 'GrantedWin', winner: bob.id },
              },
            ],
            byes: [alice.id],
          },
        ],
        bracket: [
          firstBracketRound(bob.id),
          { round: 2, places: [place(0, null, [side(alice.id), side(bob.id)])] },
        ],
      }),
      { user: dave },
    );

    expect(bracketMatches(tab, 1)).toContain(
      'Bob (seed 2) vs Carol (seed 3) · Granted win for Bob',
    );
  });

  it('shows which match still decides a place in the next tournament round', async () => {
    const { tab } = await openPlaying(singleEliminationPlaying(), { user: dave });

    expect(bracketMatches(tab, 2)).toEqual([
      'Alice (seed 1) vs the winner of Bob (seed 2) vs Carol (seed 3)',
    ]);
  });

  it('shows who advanced as soon as the match feeding their place is decided, before the next tournament round is paired', async () => {
    const { tab } = await openPlaying(carolWon, { user: dave });

    expect(bracketMatches(tab, 2)).toEqual(['Alice (seed 1) vs Carol (seed 3)']);
  });

  it('names no winner of a report the other player hasn’t confirmed, nor a next match for its reporter', async () => {
    const { tab } = await openPlaying(carolReported, { user: carolUser });

    expect(bracketMatches(tab, 1)).toContain('Bob (seed 2) 1–2 Carol (seed 3)');
    expect(bracketMatches(tab, 2)).toEqual([
      'Alice (seed 1) vs the winner of Bob (seed 2) vs Carol (seed 3)',
    ]);
    expect(text(bracket(tab))).not.toContain(YOUR_NEXT_MATCH);
  });

  it('tells a player whose opponent is still to be decided which match decides it, and highlights their path', async () => {
    const { tab } = await openPlaying(singleEliminationPlaying());

    expect(text(bracket(tab))).toContain(
      'Your next match, in the final, is against the winner of Bob (seed 2) vs Carol (seed 3).',
    );
    expect(ownPath(tab)).toEqual([
      'Alice (seed 1) has a bye',
      'Alice (seed 1) vs the winner of Bob (seed 2) vs Carol (seed 3)',
    ]);
  });

  it('tells a player who they face next', async () => {
    const { tab } = await openPlaying(final, { user: carolUser });

    expect(text(bracket(tab))).toContain(
      'Your next match, in the final, is against Alice (seed 1).',
    );
    expect(ownPath(tab)).toEqual([
      'Bob (seed 2) 1–2 Carol (seed 3) · Carol won',
      'Alice (seed 1) vs Carol (seed 3) · Unreported',
    ]);
  });

  it('names no next match for a player who is out', async () => {
    const { tab } = await openPlaying(final, { user: bobUser });

    expect(text(bracket(tab))).not.toContain(YOUR_NEXT_MATCH);
    expect(ownPath(tab)).toEqual(['Bob (seed 2) 1–2 Carol (seed 3) · Carol won']);
  });

  it('gives a bye at once to the player waiting on a match both players dropped from, naming no next match for them', async () => {
    const bothDropped = singleEliminationPlaying({
      entries: [alice.id, bob.id, carol.id].map((playerId, i) => ({
        playerId,
        dropped: playerId !== alice.id,
        droppable: true,
        seed: i + 1,
      })),
      rounds: [
        {
          round: 1,
          correctable: true,
          matches: [
            {
              ...unreportedMatch('m1', bob.id, carol.id),
              bracketPlace: 1,
              outcome: { kind: 'Forfeit', forfeitedBy: bob.id },
            },
          ],
          byes: [alice.id],
        },
      ],
      bracket: [
        firstBracketRound(),
        { round: 2, places: [place(0, null, [side(alice.id), { kind: 'Bye' }], alice.id)] },
      ],
    });

    const { tab } = await openPlaying(bothDropped);

    expect(bracketMatches(tab, 2)).toEqual(['Alice (seed 1) has a bye']);
    expect(text(bracket(tab))).not.toContain(YOUR_NEXT_MATCH);
    expect(text(bracket(tab))).not.toContain('the winner of');
  });

  it('names no next match for a viewer who isn’t playing', async () => {
    const { tab } = await openPlaying(final, { user: dave });

    expect(text(bracket(tab))).not.toContain(YOUR_NEXT_MATCH);
    expect(ownPath(tab)).toEqual([]);
  });

  it('offers the organizer each match’s game scores, and updates when the tournament is re-read', async () => {
    const { fixture, tab } = await openPlaying(singleEliminationPlaying(), {
      powers: ORGANIZE_ONLY,
    });

    button(bracket(tab)!, 'Report Bob vs Carol')!.click();
    await fixture.whenStable();
    button(group(tab, 'Game score of Bob vs Carol')!, 'Carol won 2–1')!.click();
    const req = await answerChange(
      fixture,
      '/api/drafts/draft-1/tournament/matches/m1/game-score',
      'PUT',
      carolWon,
      1,
      threePlayers,
    );

    expect(req.request.body).toEqual({ games: [1, 2] });
    expect(bracketMatches(tab, 2)).toEqual(['Alice (seed 1) vs Carol (seed 3)']);
  });
});

/** A player of the nine-player tournament, by name. */
const player = (name: string): PlayerView => ({ ...bob, id: name.toLowerCase(), name });

const [erin, finn, gwen, hugo, ivy, jack] = ['Erin', 'Finn', 'Gwen', 'Hugo', 'Ivy', 'Jack'].map(
  player,
);

/** The nine players, in seed order. */
const ninePlayers = [alicePlayer, bob, carol, erin, finn, gwen, hugo, ivy, jack];

/** `player` signed in. */
const signedIn = ({ id, name }: PlayerView): UserView => ({ ...alice, id, name });

/**
 * A single elimination tournament of nine players over 4 tournament rounds,
 * seeded in name order, in its first round: Ivy (seed 8) plays Jack (seed
 * 9) at bracket place 1, and the others have byes. Erin (seed 4) and Finn
 * (seed 5) dropped, so nobody advances from their byes, nor from the
 * quarterfinal place they would have met at.
 */
const fourRounds: ViewerTournamentView = singleEliminationPlaying({
  roundCount: 4,
  entries: ninePlayers.map(({ id }, i) => ({
    playerId: id,
    dropped: id === erin.id || id === finn.id,
    droppable: true,
    seed: i + 1,
  })),
  rounds: [
    {
      round: 1,
      correctable: true,
      matches: [{ ...unreportedMatch('m1', ivy.id, jack.id), bracketPlace: 1 }],
      byes: [alice, finn, erin, carol, gwen, hugo, bob].map(({ id }) => id),
    },
  ],
  bracket: [
    {
      round: 1,
      places: [
        place(0, null, [side(alice.id), { kind: 'Bye' }], alice.id),
        place(1, 'm1', [side(ivy.id), side(jack.id)]),
        place(2, null, [side(finn.id), { kind: 'Bye' }]),
        place(3, null, [side(erin.id), { kind: 'Bye' }]),
        place(4, null, [side(carol.id), { kind: 'Bye' }], carol.id),
        place(5, null, [side(gwen.id), { kind: 'Bye' }], gwen.id),
        place(6, null, [side(hugo.id), { kind: 'Bye' }], hugo.id),
        place(7, null, [side(bob.id), { kind: 'Bye' }], bob.id),
      ],
    },
    {
      round: 2,
      places: [
        place(0, null, [side(alice.id), winnerToCome(1)]),
        place(1, null, [{ kind: 'Bye' }, { kind: 'Bye' }]),
        place(2, null, [side(carol.id), side(gwen.id)]),
        place(3, null, [side(hugo.id), side(bob.id)]),
      ],
    },
    {
      round: 3,
      places: [
        place(0, null, [winnerToCome(0), { kind: 'Bye' }]),
        place(1, null, [winnerToCome(2), winnerToCome(3)]),
      ],
    },
    { round: 4, places: [place(0, null, [winnerToCome(0), winnerToCome(1)])] },
  ],
  standings: ninePlayers.map(({ id }) => standing(id, 1)),
});

describe('the bracket of a single elimination tournament of four tournament rounds', () => {
  /** Opens the Play tab of `fourRounds`, signed in as `user`. */
  const openFourRounds = (user: UserView = dave) =>
    openPlaying(fourRounds, { user, fields: { players: ninePlayers } });

  it('names the tournament rounds before the quarterfinal by number', async () => {
    const { tab } = await openFourRounds();

    expect(roundLabels(tab)).toEqual(['Tournament round 1', 'Quarterfinal', 'Semifinal', 'Final']);
  });

  it('shows that nobody advances to a place both of whose sides are byes', async () => {
    const { tab } = await openFourRounds();

    expect(bracketMatches(tab, 2)[1]).toBe('Nobody advances to it');
    expect(drawnPlaces(tab, 2)[1]).toEqual(['Bye', 'Bye']);
  });

  it('shows which match decides a side whose feeding place still waits on a winner itself', async () => {
    const { tab } = await openFourRounds();

    expect(bracketMatches(tab, 3)).toEqual([
      'the winner of match 1 in the quarterfinal has a bye',
      'the winner of Carol (seed 3) vs Gwen (seed 6) vs the winner of Hugo (seed 7) vs Bob (seed 2)',
    ]);
    expect(bracketMatches(tab, 4)).toEqual([
      'the winner of match 1 in the semifinal vs the winner of match 2 in the semifinal',
    ]);
    expect(drawnPlaces(tab, 3)).toEqual([
      ['Winner to come', 'Bye'],
      ['Winner of Carol vs Gwen', 'Winner of Hugo vs Bob'],
    ]);
    expect(drawnPlaces(tab, 4)).toEqual([['Winner to come', 'Winner to come']]);
  });

  it('tells a player in an unreported match of the first tournament round who they face', async () => {
    const { tab } = await openFourRounds(signedIn(ivy));

    expect(text(bracket(tab))).toContain(
      'Your next match, in tournament round 1, is against Jack (seed 9).',
    );
  });

  it('names no next match for a dropped player whose bye sends nobody on', async () => {
    const { tab } = await openFourRounds(signedIn(erin));

    expect(ownPath(tab)).toEqual(['Erin (seed 4) has a bye']);
    expect(text(bracket(tab))).not.toContain(YOUR_NEXT_MATCH);
  });
});
