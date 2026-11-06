import { TOURNAMENT_FORMAT_NAMES } from 'contract';
import type { DraftEvent } from '../drafts/draft-events.js';
import type { TournamentFormat } from '../generated/prisma/client.js';
import type {
  AnnouncedDraft,
  AnnouncedPlayer,
  WebhookMessage,
} from './draft-messages.js';
import { bold, mention } from './markdown.js';

/** A tournament event, as draft events carry them. */
export type TournamentEvent = Extract<
  DraftEvent,
  { type: `tournament-${string}` }
>;

/**
 * The announcement of a tournament event, as one message, which may yet be
 * split across posts. Each ends with a link to the draft's Play tab.
 * Only players named to play are pinged: the draft's players when
 * registration opens, and each tournament round's match players. Bots are
 * named, never pinged.
 */
export function tournamentMessage(
  draft: AnnouncedDraft,
  event: TournamentEvent,
): WebhookMessage {
  switch (event.type) {
    case 'tournament-set-up':
      return tournamentSetUpMessage(draft, event.format, event.players);
    case 'tournament-started':
      return tournamentStartedMessage(draft, event.format, event.players);
    case 'tournament-round-completed':
      return tournamentRoundCompletedMessage(draft, event);
    case 'tournament-completed':
      return tournamentCompletedMessage(
        draft,
        event.format,
        event.trophyHolders,
      );
  }
}

/**
 * `players` are the draft's players: each but a bot is pinged to join, and
 * the bots, which joined at setup, are named.
 */
export function tournamentSetUpMessage(
  draft: AnnouncedDraft,
  format: TournamentFormat,
  players: AnnouncedPlayer[],
): WebhookMessage {
  const pinged = players.filter((player) => !player.isBot);
  const pings = pinged.map((player) => mention(player.id)).join(' ');
  const bots = players
    .filter((player) => player.isBot)
    .map((bot) => bold(bot.name));
  const joined =
    bots.length === 0
      ? ''
      : ` ${listed(bots)} ${bots.length === 1 ? 'has' : 'have'} joined.`;
  return tournamentAnnouncement(
    draft,
    [`${tournamentOf(draft, format)} is in registration.${joined}`],
    `${pings ? `${pings} join` : 'Join'} from the Play tab.`,
    pinged,
  );
}

/** `players` are its joined players, in join order. */
function tournamentStartedMessage(
  draft: AnnouncedDraft,
  format: TournamentFormat,
  players: AnnouncedPlayer[],
): WebhookMessage {
  return tournamentAnnouncement(
    draft,
    [
      `${tournamentOf(draft, format)} has started with ${listed(players.map((player) => bold(player.name)))}.`,
    ],
    null,
    [],
  );
}

/**
 * The tournament round `round` just paired, after the one before it was
 * completed: each match pings its players, naming its bots, and each bye
 * names its player.
 */
function tournamentRoundCompletedMessage(
  draft: AnnouncedDraft,
  {
    round,
    matches,
    byes,
  }: Omit<
    Extract<TournamentEvent, { type: 'tournament-round-completed' }>,
    'type'
  >,
): WebhookMessage {
  return tournamentAnnouncement(
    draft,
    [
      `Tournament round ${round - 1} of ${bold(draft.name)}’s tournament is complete. Tournament round ${round}:`,
      ...matches.map(
        ([first, second]) => `${pingOrName(first)} vs ${pingOrName(second)}`,
      ),
      ...byes.map((player) => `${bold(player.name)} has a bye.`),
    ],
    null,
    matches.flat().filter((player) => !player.isBot),
  );
}

/** A mention of `player`, or a bot's name, as a bot is never pinged. */
function pingOrName(player: AnnouncedPlayer) {
  return player.isBot ? bold(player.name) : mention(player.id);
}

/** `trophyHolders` are everyone who holds the trophy, sharing it if several. */
function tournamentCompletedMessage(
  draft: AnnouncedDraft,
  format: TournamentFormat,
  trophyHolders: AnnouncedPlayer[],
): WebhookMessage {
  const names = trophyHolders.map((player) => bold(player.name));
  const trophy =
    names.length === 0
      ? 'Nobody holds the trophy.'
      : names.length === 1
        ? `The trophy goes to ${names[0]}.`
        : `${listed(names)} share the trophy.`;
  return tournamentAnnouncement(
    draft,
    [`${tournamentOf(draft, format)} is complete. ${trophy}`],
    null,
    [],
  );
}

/** Such as "**Red**’s Swiss tournament". */
function tournamentOf(draft: AnnouncedDraft, format: TournamentFormat) {
  return `${bold(draft.name)}’s ${TOURNAMENT_FORMAT_NAMES[format]} tournament`;
}

/** Such as "A, B and C". */
function listed(items: string[]): string {
  return items.length <= 1
    ? items.join('')
    : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/**
 * `lines`, then a last line of `call` if any and the masked link to the
 * draft's Play tab, pinging `pinged`, who are never bots.
 */
function tournamentAnnouncement(
  draft: AnnouncedDraft,
  lines: string[],
  call: string | null,
  pinged: AnnouncedPlayer[],
): WebhookMessage {
  // Masked, with the URL in angle brackets so Discord shows no preview.
  const link = `[Open tournament](<${draft.url}?tab=play>)`;
  return {
    content: [...lines, call ? `${call} ${link}` : link].join('\n'),
    allowed_mentions: {
      parse: [],
      users: [...new Set(pinged.map((player) => player.id))],
    },
  };
}
