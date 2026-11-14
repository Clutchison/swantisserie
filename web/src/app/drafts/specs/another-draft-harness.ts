import type { PickView, PoolCardView, PoolSnapshotView, UserView } from 'contract';
import { alice } from '../../specs-harness';
import { answerOpening, type AppFixture, draft, type DraftFixture, http, router } from './harness';

/** The id of the other draft a spec goes to from draft-1's page. */
export const OTHER_DRAFT_ID = 'draft-2';

/**
 * Goes from the open draft's page to draft-2's with the router, as the Turn
 * link does, and answers the reads its page makes as it opens, as `openDraft`
 * does: the draft, as `draft` makes it from `fields`, then its pool, picks,
 * and `user`'s queue and plan as `answerOpening` answers them.
 */
export async function goToOtherDraft(
  fixture: AppFixture,
  snapshot: PoolSnapshotView,
  fields: DraftFixture = {},
  {
    cards,
    picks,
    user = alice,
  }: { cards?: PoolCardView[]; picks?: PickView[]; user?: UserView } = {},
) {
  await router.navigateByUrl(`/drafts/${OTHER_DRAFT_ID}`);
  const opened = draft({ snapshot, ...fields, id: OTHER_DRAFT_ID });
  (await vi.waitFor(() => http.expectOne(`/api/drafts/${OTHER_DRAFT_ID}`))).flush(opened);
  await answerOpening(opened, { cards, picks, user });
  await fixture.whenStable();
  return opened;
}
