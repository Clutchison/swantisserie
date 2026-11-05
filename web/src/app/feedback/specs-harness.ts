import { vi } from 'vitest';
import type { HttpTestingController } from '@angular/common/http/testing';
import type { UnreviewedFeedbackCount } from 'contract';

/** App admins' headers ask how much feedback is unreviewed; answers that, if it was asked. */
export function answerUnreviewedCount(http: HttpTestingController) {
  for (const req of http.match('/api/admin/feedback/unreviewed-count')) {
    req.flush({ count: 0 } satisfies UnreviewedFeedbackCount);
  }
}

/** A link inside `root`, by its accessible name: its text or its aria-label. */
export const link = (root: Element, name: string) =>
  [...root.querySelectorAll<HTMLAnchorElement>('a[href]')].find(
    (a) => a.textContent?.trim() === name || a.getAttribute('aria-label') === name,
  );

/** Answers the draft page's request for draft 42 with a 404: these specs only need its URL. */
export async function answerDraft42NotFound(http: HttpTestingController) {
  (await vi.waitFor(() => http.expectOne('/api/drafts/42'))).flush(null, {
    status: 404,
    statusText: 'Not Found',
  });
}
