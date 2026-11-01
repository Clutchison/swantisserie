import type { DraftEvent, EventPlayer } from '../drafts/draft-events.js';

/** A draft as its announcements name it and its start links to it. */
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

/**
 * One message per announcement `events` make: a run of picks, such as a
 * pick and the cascade after it, is one message, and so is a start, a resume
 * or a reopen and the cascade after it.
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
        messages.push(picksMessage([announcedPick(event), ...picks]));
        break;
      case 'undone':
        messages.push(undoneMessage(event));
        break;
      case 'paused':
        messages.push(draftPausedMessage(draft));
        break;
      case 'resumed':
        messages.push(draftResumedMessage(draft, event.player, picks));
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
    }
  }
  return messages;
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
    [
      `${bold(draft.name)} has started. Seat order:`,
      ...seats.map((player, seat) => `${seat + 1}. ${bold(player.name)}`),
      ...picks.map(pickLine),
    ],
    picks.length > 0 ? picks[picks.length - 1].next : (seats[0] ?? null),
    draft.url,
  );
}

export function draftCompleteMessage(draft: AnnouncedDraft): WebhookMessage {
  return announcement([`${bold(draft.name)} is complete`], null);
}

export function draftPausedMessage(draft: AnnouncedDraft): WebhookMessage {
  return announcement([`${bold(draft.name)} is paused`], null);
}

/**
 * `up` is whose turn it is on resuming, unless `picks` were made from
 * queues straight after the resume.
 */
export function draftResumedMessage(
  draft: AnnouncedDraft,
  up: AnnouncedPlayer,
  picks: AnnouncedPick[] = [],
): WebhookMessage {
  return backToDraftingMessage(draft, 'has resumed', up, picks);
}

export function draftClosedMessage(draft: AnnouncedDraft): WebhookMessage {
  return announcement([`${bold(draft.name)} has been closed`], null);
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
export function undoneMessage({
  number,
  player,
  card,
}: AnnouncedUndo): WebhookMessage {
  return announcement(
    [`Pick ${number} (${bold(card)} by ${bold(player.name)}) was undone`],
    player,
  );
}

/** `picks` in pick order, at least one; the last one's next player is up. */
export function picksMessage(picks: AnnouncedPick[]): WebhookMessage {
  return announcement(picks.map(pickLine), picks[picks.length - 1].next);
}

/** The draft `happened`, then any cascade; `up` is who is next without one. */
function backToDraftingMessage(
  draft: AnnouncedDraft,
  happened: string,
  up: AnnouncedPlayer,
  picks: AnnouncedPick[],
): WebhookMessage {
  return announcement(
    [`${bold(draft.name)} ${happened}`, ...picks.map(pickLine)],
    picks.length > 0 ? picks[picks.length - 1].next : up,
  );
}

function announcedPick(event: PickedEvent): AnnouncedPick {
  const { type: _type, ...pick } = event;
  return pick;
}

function pickLine(pick: AnnouncedPick): string {
  const number = `pick ${pick.number}${pick.queued ? ', queued' : ''}`;
  return `${bold(pick.player.name)} picked ${bold(pick.card)} (${number})`;
}

/**
 * `lines`, then who is `up` if anyone is, then a link to `url` if given.
 * Only a player who isn't a bot is pinged.
 */
function announcement(
  lines: string[],
  up: AnnouncedPlayer | null,
  url?: string,
): WebhookMessage {
  const pinged = up && !up.isBot ? up : null;
  return {
    content: [
      ...lines,
      ...(pinged ? [`<@${pinged.id}> you’re up`] : []),
      ...(up?.isBot ? [`${bold(up.name)} is up`] : []),
      // In angle brackets, so Discord doesn't embed a preview of the page.
      ...(url ? [`<${url}>`] : []),
    ].join('\n'),
    allowed_mentions: { parse: [], users: pinged ? [pinged.id] : [] },
  };
}

/** `text` in bold, with any markdown or mention in it shown as written. */
function bold(text: string): string {
  return `**${text.replace(/[\\*_~|`<>[\]]/g, '\\$&')}**`;
}
