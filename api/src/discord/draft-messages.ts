import type { DraftEvent, EventPlayer } from '../drafts/draft-events.js';

/** A draft as its announcements name and link to it. */
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
 * pick and the cascade after it, is one message, and so is a start and the
 * cascade after it.
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
    draft,
    picks.length > 0 ? picks[picks.length - 1].next : (seats[0] ?? null),
  );
}

export function draftCompleteMessage(draft: AnnouncedDraft): WebhookMessage {
  return announcement(
    [`${bold(draft.name)} is complete. See everyone’s picks:`],
    draft,
    null,
  );
}

/** The undone pick's player is up again. */
export function undoneMessage(
  draft: AnnouncedDraft,
  { number, player, card }: AnnouncedUndo,
): WebhookMessage {
  return announcement(
    [`Pick ${number} (${bold(card)} by ${bold(player.name)}) was undone`],
    draft,
    player,
  );
}

/** `picks` in pick order, at least one; the last one's next player is up. */
export function picksMessage(
  draft: AnnouncedDraft,
  picks: AnnouncedPick[],
): WebhookMessage {
  return announcement(picks.map(pickLine), draft, picks[picks.length - 1].next);
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
 * `lines`, then who is `up` if anyone is, then the draft's link. Only a
 * player who isn't a bot is pinged.
 */
function announcement(
  lines: string[],
  draft: AnnouncedDraft,
  up: AnnouncedPlayer | null,
): WebhookMessage {
  const pinged = up && !up.isBot ? up : null;
  return {
    content: [
      ...lines,
      ...(pinged ? [`<@${pinged.id}> you’re up`] : []),
      ...(up?.isBot ? [`${bold(up.name)} is up`] : []),
      link(draft),
    ].join('\n'),
    allowed_mentions: { parse: [], users: pinged ? [pinged.id] : [] },
  };
}

/** `text` in bold, with any markdown or mention in it shown as written. */
function bold(text: string): string {
  return `**${text.replace(/[\\*_~|`<>[\]]/g, '\\$&')}**`;
}

/** In angle brackets, so Discord doesn't embed a preview of the page. */
function link(draft: AnnouncedDraft): string {
  return `<${draft.url}>`;
}
