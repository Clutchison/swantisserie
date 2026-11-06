import type { ViewerTournamentView } from 'contract';
import { openDialog } from '../../specs-harness';
import {
  ORGANIZE_ONLY,
  alice,
  alicePlayer,
  bob,
  button,
  controlByLabel,
  controlsByLabel,
  group,
  namedList,
  useDraftsApp,
} from './harness';
import {
  carol,
  openMatch,
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

/** Opens the Play tab of the draft of Alice, Bob and the bot, with `tournament`, for an organizer. */
const openWithBot = (tournament: ViewerTournamentView) =>
  openPlaying(tournament, { powers: ORGANIZE_ONLY, fields: { players: [alicePlayer, bob, bot] } });

/** Opens the Complete round dialog for an organizer of the draft with the bot, on `tournament`. */
async function openCompleteRound(tournament: ViewerTournamentView) {
  const opened = await openWithBot(tournament);
  button(opened.tab, 'Complete round')!.click();
  await opened.fixture.whenStable();
  return openDialog()!;
}

describe('bots on the Play tab', () => {
  it('lists a bot as joined in registration, with no Remove', async () => {
    const { tab } = await openWithBot(registration(carol.id, bob.id));

    expect(namedList(tab, 'Joined players').textContent).toContain('Bot 1');
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
    const dialog = await openCompleteRound(
      swissPlaying({
        lastCompletedRound: 0,
        rounds: [{ round: 1, matches: [openMatch('m1', carol.id, bob.id)], byes: [alice.id] }],
      }),
    );

    const drops = group(dialog, 'Drop from Bot 1 vs Bob')!;
    expect(controlByLabel(drops, 'checkbox', 'Drop Bob')).toBeDefined();
    expect(controlsByLabel(drops, 'checkbox', 'Drop Bot 1')).toEqual([]);
  });

  it('offers either player of a bot’s single elimination match the win, and a drop only to its human', async () => {
    const dialog = await openCompleteRound(singleEliminationPlaying());

    const winner = group(dialog, 'Winner of Bob vs Bot 1')!;
    expect(controlByLabel(winner, 'radio', 'Bob')).toBeDefined();
    expect(controlByLabel(winner, 'radio', 'Bot 1')).toBeDefined();
    const drops = group(dialog, 'Drop from Bob vs Bot 1')!;
    expect(controlByLabel(drops, 'checkbox', 'Drop Bob')).toBeDefined();
    expect(controlsByLabel(drops, 'checkbox', 'Drop Bot 1')).toEqual([]);
  });
});
