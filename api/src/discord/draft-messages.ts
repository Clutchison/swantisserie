import type { DraftEvent, EventPlayer } from '../drafts/draft-events.js';

/** A draft as its announcements name and link to it. */
export interface AnnouncedDraft {
  name: string;
  /** The draft's page in the app. */
  url: string;
}

/** A player as announcements name or ping them. */
export type AnnouncedPlayer = EventPlayer;

export type AnnouncedPick = Omit<
  Extract<DraftEvent, { type: 'picked' }>,
  'type'
>;

/** The body of a Discord webhook post: text only, no embeds. */
export interface WebhookMessage {
  content: string;
  /** Limits pings to the users listed, whatever the content says. */
  allowed_mentions: { parse: []; users: string[] };
}

/** `seats` are the players in seat order; the first is up. */
export function draftStartedMessage(
  draft: AnnouncedDraft,
  seats: AnnouncedPlayer[],
): WebhookMessage {
  return announcement(
    [
      `${bold(draft.name)} has started. Seat order:`,
      ...seats.map((player, seat) => `${seat + 1}. ${bold(player.name)}`),
    ],
    draft,
    seats[0] ?? null,
  );
}

export function draftCompleteMessage(draft: AnnouncedDraft): WebhookMessage {
  return announcement(
    [`${bold(draft.name)} is complete. See everyone’s picks:`],
    draft,
    null,
  );
}

export function pickMessage(
  draft: AnnouncedDraft,
  pick: AnnouncedPick,
): WebhookMessage {
  return announcement(
    [
      `${bold(pick.player.name)} picked ${bold(pick.card)} (pick ${pick.number})`,
    ],
    draft,
    pick.next,
  );
}

/** `lines`, then a ping for `pinged` if there is one, then the draft's link. */
function announcement(
  lines: string[],
  draft: AnnouncedDraft,
  pinged: AnnouncedPlayer | null,
): WebhookMessage {
  return {
    content: [
      ...lines,
      ...(pinged ? [`<@${pinged.id}> you’re up`] : []),
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
