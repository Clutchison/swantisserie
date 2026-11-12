import type { DraftEvent, EventPlayer } from '../drafts/draft-events.js';
import { bold, mention } from './markdown.js';
import { tournamentMessage } from './tournament-messages.js';

/** A draft as its announcements name it and link to it. */
export interface AnnouncedDraft {
  name: string;
  /** The draft's page in the app. */
  url: string;
}

/** A player as announcements name or ping them. */
export type AnnouncedPlayer = EventPlayer;

type PickedEvent = Extract<DraftEvent, { type: 'picked' }>;

export type AnnouncedPick = Omit<PickedEvent, 'type'>;

export type AnnouncedUndo = Omit<
  Extract<DraftEvent, { type: 'undone' }>,
  'type'
>;

/** The body of a Discord webhook post: text only, no embeds. */
export interface WebhookMessage {
  content: string;
  /** Limits pings to the users listed, whatever the content says. */
  allowed_mentions: { parse: []; users: string[] };
}

/** The most characters of `content` Discord takes in one webhook post. */
const MAX_CONTENT_LENGTH = 2000;

/**
 * The messages to post, in order, for the announcements `events` make: a run
 * of picks, such as a pick and the cascade after it, is one announcement, and
 * so is a start, an unfreeze or a reopen and the cascade after it. Each
 * announcement is one post, or several if it is too long for one.
 */
export function draftMessages(
  draft: AnnouncedDraft,
  events: DraftEvent[],
): WebhookMessage[] {
  const messages: WebhookMessage[] = [];
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    // The picks straight after this event.
    const picks: AnnouncedPick[] = [];
    for (
      let next = events[i + 1];
      next?.type === 'picked';
      next = events[++i + 1]
    ) {
      picks.push(announcedPick(next));
    }
    switch (event.type) {
      case 'started':
        messages.push(draftStartedMessage(draft, event.seats, picks));
        break;
      case 'picked':
        messages.push(picksMessage(draft, [announcedPick(event), ...picks]));
        break;
      case 'undone':
        messages.push(undoneMessage(draft, event));
        break;
      case 'frozen':
        messages.push(draftFrozenMessage(draft));
        break;
      case 'unfrozen':
        messages.push(draftUnfrozenMessage(draft, event.player, picks));
        break;
      case 'closed':
        messages.push(draftClosedMessage(draft));
        break;
      case 'reopened':
        messages.push(draftReopenedMessage(draft, event.player, picks));
        break;
      case 'completed':
        messages.push(draftCompleteMessage(draft));
        break;
      case 'tournament-set-up':
      case 'tournament-started':
      case 'tournament-round-completed':
      case 'tournament-completed':
        messages.push(tournamentMessage(draft, event));
        break;
    }
  }
  return messages.flatMap(splitIntoPosts);
}

/**
 * `message` as few posts as Discord takes, broken only between lines. Each
 * post pings only the users it mentions, so a draft announcement's up line,
 * which is its last line, pings only in the last post.
 */
function splitIntoPosts(message: WebhookMessage): WebhookMessage[] {
  // UTF-16 length is never less than what Discord counts.
  if (message.content.length <= MAX_CONTENT_LENGTH) return [message];
  const posts: string[] = [];
  for (const line of message.content.split('\n')) {
    const last = posts.length - 1;
    if (
      last >= 0 &&
      posts[last].length + 1 + line.length <= MAX_CONTENT_LENGTH
    ) {
      posts[last] += `\n${line}`;
    } else {
      posts.push(line);
    }
  }
  return posts.map((content) => ({
    content,
    allowed_mentions: {
      parse: [],
      users: message.allowed_mentions.users.filter((id) =>
        content.includes(mention(id)),
      ),
    },
  }));
}

/**
 * `seats` are the players in seat order; the first is up, unless `picks`
 * were made from queues straight after the start.
 */
export function draftStartedMessage(
  draft: AnnouncedDraft,
  seats: AnnouncedPlayer[],
  picks: AnnouncedPick[] = [],
): WebhookMessage {
  return announcement(
    draft,
    [
      `${bold(draft.name)} has started. Seat order:`,
      ...seats.map((player, seat) => `${seat + 1}. ${bold(player.name)}`),
      ...picks.map(pickLine),
    ],
    upAfter(picks, seats[0] ?? null),
  );
}

export function draftCompleteMessage(draft: AnnouncedDraft): WebhookMessage {
  return announcement(draft, [`${bold(draft.name)} is complete`], null);
}

export function draftFrozenMessage(draft: AnnouncedDraft): WebhookMessage {
  return announcement(draft, [`${bold(draft.name)} is frozen`], null);
}

/**
 * `up` is whose turn it is on unfreezing, unless `picks` were made from
 * queues straight after the unfreeze.
 */
export function draftUnfrozenMessage(
  draft: AnnouncedDraft,
  up: AnnouncedPlayer,
  picks: AnnouncedPick[] = [],
): WebhookMessage {
  return backToDraftingMessage(draft, 'has been unfrozen', up, picks);
}

export function draftClosedMessage(draft: AnnouncedDraft): WebhookMessage {
  return announcement(draft, [`${bold(draft.name)} has been closed`], null);
}

/**
 * `up` is whose turn it is on reopening, unless `picks` were made from
 * queues straight after the reopen.
 */
export function draftReopenedMessage(
  draft: AnnouncedDraft,
  up: AnnouncedPlayer,
  picks: AnnouncedPick[] = [],
): WebhookMessage {
  return backToDraftingMessage(draft, 'has reopened', up, picks);
}

/** The undone pick's player is up again. */
export function undoneMessage(
  draft: AnnouncedDraft,
  undone: AnnouncedUndo,
): WebhookMessage {
  return announcement(draft, [`Undone: ${pickLine(undone)}`], undone.player);
}

/**
 * `picks` in pick order, at least one; the last one's next player is up. A
 * player who has just picked by hand and is up again is named, not pinged:
 * they know. A queued pick still pings them, as they may be away.
 */
export function picksMessage(
  draft: AnnouncedDraft,
  picks: AnnouncedPick[],
): WebhookMessage {
  const { player, queued, next } = picks[picks.length - 1];
  const ping = queued || next?.id !== player.id;
  return announcement(draft, picks.map(pickLine), next, { ping });
}

/** The draft `happened`, then any cascade; `up` is who is next without one. */
function backToDraftingMessage(
  draft: AnnouncedDraft,
  happened: string,
  up: AnnouncedPlayer,
  picks: AnnouncedPick[],
): WebhookMessage {
  return announcement(
    draft,
    [`${bold(draft.name)} ${happened}`, ...picks.map(pickLine)],
    upAfter(picks, up),
  );
}

/** Who is up after `picks`, the cascade if any; `up` is who is up without one. */
function upAfter(
  picks: AnnouncedPick[],
  up: AnnouncedPlayer | null,
): AnnouncedPlayer | null {
  return picks.length > 0 ? picks[picks.length - 1].next : up;
}

function announcedPick(event: PickedEvent): AnnouncedPick {
  const { type: _type, ...pick } = event;
  return pick;
}

function pickLine({ number, player, card }: AnnouncedUndo): string {
  return `${number}- ${bold(player.name)} picked ${bold(card)}`;
}

/**
 * `lines`, then who is `up` if anyone is, ending with a link to `draft`.
 * Whoever is up is pinged if `ping` and they aren't a bot, and named
 * otherwise. With nobody up, there is no link.
 */
function announcement(
  draft: AnnouncedDraft,
  lines: string[],
  up: AnnouncedPlayer | null,
  { ping = true }: { ping?: boolean } = {},
): WebhookMessage {
  const pinged = up && ping && !up.isBot ? up : null;
  const upLine = pinged
    ? `${mention(pinged.id)} you’re up.`
    : up && `${bold(up.name)} is up.`;
  return {
    content: [
      ...lines,
      // Masked, with the URL in angle brackets so Discord shows no preview.
      ...(upLine ? [`${upLine} [Open draft](<${draft.url}>)`] : []),
    ].join('\n'),
    allowed_mentions: { parse: [], users: pinged ? [pinged.id] : [] },
  };
}
