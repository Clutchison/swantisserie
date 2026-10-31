import type { HttpTestingController } from '@angular/common/http/testing';

/** App admins' headers ask how much feedback is unreviewed; answers that, if it was asked. */
export function answerUnreviewedCount(http: HttpTestingController) {
  for (const req of http.match('/api/admin/feedback/unreviewed-count')) {
    req.flush({ count: 0 });
  }
}
