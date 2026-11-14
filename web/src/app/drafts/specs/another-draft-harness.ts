import type { PickView, PoolCardView, PoolSnapshotView } from 'contract';
import { alice } from '../../specs-harness';
import { EMPTY_PLAN, EMPTY_QUEUE } from '../drafts';
import { type AppFixture, draft, type DraftFixture, http, router } from './harness';

/** The id of the other draft a spec goes to from draft-1's page. */
export const OTHER_DRAFT_ID = 'draft-2';

/**
 * Goes from the open draft's page to draft-2's with the router, as the Turn
 * link does, and answers the reads its page makes as it opens: the draft, as
 * `draft` makes it from `fields`; its pool once the snapshot is complete; its
 * pick log once started; and Alice's queue and plan if she plays in it.
 */
export async function goToOtherDraft(
  fixture: AppFixture,
  snapshot: PoolSnapshotView,
  fields: DraftFixture = {},
  { cards = [], picks = [] }: { cards?: PoolCardView[]; picks?: PickView[] } = {},
) {
  const url = `/api/drafts/${OTHER_DRAFT_ID}`;
  await router.navigateByUrl(`/drafts/${OTHER_DRAFT_ID}`);
  const opened = draft({ snapshot, ...fields, id: OTHER_DRAFT_ID });
  (await vi.waitFor(() => http.expectOne(url))).flush(opened);
  if (snapshot.state === 'Complete') {
    (await vi.waitFor(() => http.expectOne(`${url}/pool`))).flush(cards);
  }
  if (opened.state !== 'Lobby') {
    (await vi.waitFor(() => http.expectOne(`${url}/picks`))).flush(picks);
  }
  if (opened.players.some((player) => player.id === alice.id)) {
    (await vi.waitFor(() => http.expectOne(`${url}/queue`))).flush(EMPTY_QUEUE);
    (await vi.waitFor(() => http.expectOne(`${url}/plan`))).flush(EMPTY_PLAN);
  }
  await fixture.whenStable();
  return opened;
}
