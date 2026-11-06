import { ORGANIZE_ONLY, alice, bob, button, group, text, useDraftsApp } from './harness';
import {
  answerChange,
  bobUser,
  bracket,
  bracketMatches,
  carol,
  carolBeatBob,
  carolUser,
  dave,
  firstBracketRound,
  unreportedMatch,
  openPlaying,
  ownPath,
  place,
  roundLabels,
  side,
  singleEliminationFinal as final,
  singleEliminationPlaying,
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
    expect(text(bracket(tab))).not.toContain('Your next match');
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

    expect(text(bracket(tab))).not.toContain('Your next match');
    expect(ownPath(tab)).toEqual(['Bob (seed 2) 1–2 Carol (seed 3) · Carol won']);
  });

  it('gives a bye at once to the player waiting on a match both players dropped from, naming no next match for them', async () => {
    const bothDropped = singleEliminationPlaying({
      entries: [alice.id, bob.id, carol.id].map((playerId, i) => ({
        playerId,
        dropped: playerId !== alice.id,
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
    expect(text(bracket(tab))).not.toContain('Your next match');
    expect(text(bracket(tab))).not.toContain('the winner of');
  });

  it('names no next match for a viewer who isn’t playing', async () => {
    const { tab } = await openPlaying(final, { user: dave });

    expect(text(bracket(tab))).not.toContain('Your next match');
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
