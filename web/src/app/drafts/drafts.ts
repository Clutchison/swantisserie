/** Lobby → Drafting ⇄ Paused → Complete. */
export type DraftState = 'Lobby' | 'Drafting' | 'Paused' | 'Complete';

/** A draft, as GET /api/drafts and POST /api/drafts report it. */
export interface DraftView {
  id: string;
  name: string;
  poolQuery: string;
  picksPerPlayer: number;
  state: DraftState;
  organizer: { id: string; name: string };
  createdAt: string;
}

/** The body of a failed POST /api/drafts: what to tell the organizer. */
export type DraftProblem =
  | { error: 'not-on-arena'; message: string; cards: string[]; totalCards: number }
  | { error: 'query-rejected'; message: string; warnings: string[] }
  | { error: 'no-cards' | 'invalid' | 'scryfall-unavailable'; message: string }
  /** Set by the web app when the API gave no explanation, e.g. offline. */
  | { error: 'request-failed'; message: string };
