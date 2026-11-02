/** Feedback as app admins see it. */
export interface FeedbackView {
  id: string;
  message: string;
  pageUrl: string;
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
