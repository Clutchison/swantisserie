import type { ViewerTournamentView } from 'contract';
import {
  ORGANIZE_ONLY,
  alice,
  alicePlayer,
  bob,
  button,
  controlByLabel,
  controlsByLabel,
  group,
  useDraftsApp,
} from './harness';
import {
  carol,
  joinedNames,
  openCompleteRound,
  unreportedMatch,
  openPlaying,
  playing,
  registration,
  singleEliminationPlaying,
  swissPlaying,
  withDrops,
} from './play-tab-harness';

useDraftsApp();

/** A bot in Carol's seat, so the tournament fixtures' Carol is a bot. */
const bot = { ...carol, name: 'Bot 1', isBot: true };

/** The draft of Alice, Bob and the bot. */
const withBot = { fields: { players: [alicePlayer, bob, bot] } };

/** `tournament` as the api reads it with the bot in Carol's seat: the bot can't be dropped. */
const botStaysIn = (tournament: ViewerTournamentView): ViewerTournamentView => ({
  ...tournament,
  entries: tournament.entries.map((entry) =>
    entry.playerId === bot.id ? { ...entry, droppable: false } : entry,
  ),
});

/** Opens the Play tab of the draft of Alice, Bob and the bot, with `tournament`, for an organizer. */
const openWithBot = (tournament: ViewerTournamentView) =>
  openPlaying(botStaysIn(tournament), { powers: ORGANIZE_ONLY, ...withBot });

describe('bots on the Play tab', () => {
  it('lists a bot as joined in registration, with no Remove', async () => {
    const { tab } = await openWithBot(registration(carol.id, bob.id));

    expect(joinedNames(tab)).toContain('Bot 1');
    expect(button(tab, 'Remove Bob')).toBeDefined();
    expect(button(tab, 'Remove Bot 1')).toBeUndefined();
  });

  it('offers no Drop for a bot', async () => {
    const { tab } = await openWithBot(playing());

    expect(button(tab, 'Drop Bob')).toBeDefined();
    expect(button(tab, 'Drop Bot 1')).toBeUndefined();
  });

  it('offers no Reinstate for a bot, were it ever dropped', async () => {
    const { tab } = await openWithBot(withDrops([bob.id, carol.id]));

    expect(button(tab, 'Reinstate Bob')).toBeDefined();
    expect(button(tab, 'Reinstate Bot 1')).toBeUndefined();
  });

  it('offers no drop of a bot from its match as Swiss grants it a draw', async () => {
    const { dialog } = await openCompleteRound(
      botStaysIn(
        swissPlaying({
          lastCompletedRound: 0,
          rounds: [
            {
              round: 1,
              correctable: true,
              matches: [unreportedMatch('m1', carol.id, bob.id)],
              byes: [alice.id],
            },
          ],
        }),
      ),
      withBot,
    );

    const drops = group(dialog, 'Drop from Bot 1 vs Bob')!;
    expect(controlByLabel(drops, 'checkbox', 'Drop Bob')).toBeDefined();
    expect(controlsByLabel(drops, 'checkbox', 'Drop Bot 1')).toEqual([]);
  });

  it('offers either player of a bot’s single elimination match the win, and a drop only to its human', async () => {
    const { dialog } = await openCompleteRound(botStaysIn(singleEliminationPlaying()), withBot);

    const winner = group(dialog, 'Winner of Bob vs Bot 1')!;
    expect(controlByLabel(winner, 'radio', 'Bob')).toBeDefined();
    expect(controlByLabel(winner, 'radio', 'Bot 1')).toBeDefined();
    const drops = group(dialog, 'Drop from Bob vs Bot 1')!;
    expect(controlByLabel(drops, 'checkbox', 'Drop Bob')).toBeDefined();
    expect(controlsByLabel(drops, 'checkbox', 'Drop Bot 1')).toEqual([]);
  });
});
