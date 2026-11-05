/** Feedback as app admins see it. */
export interface FeedbackView {
  id: string;
  message: string;
  /** The path of the page it was sent from, with its query and hash. */
  pagePath: string;
  /** ISO timestamp. */
  sentAt: string;
  sender: { name: string; avatarUrl: string };
}

/** Reviewed feedback as app admins see it. */
export interface ReviewedFeedbackView extends FeedbackView {
  /** ISO timestamp. */
  reviewedAt: string;
  reviewedBy: { name: string };
}

/** How much feedback is unreviewed, for app admins' top bar. */
export interface UnreviewedFeedbackCount {
  count: number;
}

/** The most characters in a feedback message. */
export const MAX_FEEDBACK_LENGTH = 2000;

/** The most characters in a feedback's page path. */
export const MAX_PAGE_PATH_LENGTH = 2048;

/** Feedback a guild member sends to the app admins. */
export interface FeedbackRequest {
  message: string;
  /**
   * The path of the page they sent it from, with its query and hash: it
   * starts with one `/` and names no scheme or host.
   */
  pagePath: string;
}
