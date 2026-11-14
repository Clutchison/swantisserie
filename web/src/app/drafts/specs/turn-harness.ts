import { byAriaLabel } from '../../specs-harness';
import { draft, flushPicks, updates, type AppFixture, type DraftFixture } from './harness';

/**
 * The Turn banner's live region inside `root`, the status named Turn: there
 * on every loaded draft page, and empty unless it is the viewer's turn.
 */
export const turnBanner = (root: HTMLElement) => byAriaLabel(root, '[role="status"]', 'Turn');

/**
 * Pushes draft-1, as `draft` makes it with `fields`, to the open page as a
 * change to it would, at the version shown, and answers the pick log's re-read.
 */
export async function pushDraft(fixture: AppFixture, fields: DraftFixture) {
  updates.events.next({ type: 'changed', draft: draft(fields) });
  await flushPicks([]);
  await fixture.whenStable();
}
