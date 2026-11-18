import {
  useDraftsApp,
  openDraft,
  completeSnapshot,
  button,
  drafting,
  queueOf,
  queued,
} from './harness';
import { useTallScreen, shivan, brightclimb, openDetail } from './pool-tab-harness';

useDraftsApp();
useTallScreen();

describe('pool tab', () => {
  it('plans a card only by queuing it: its Card detail offers neither Add to Deck nor Remove from Deck', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards: [brightclimb, shivan],
      queue: queueOf({ cards: [queued(shivan)] }),
    });

    for (const index of [0, 1]) {
      const detail = await openDetail(fixture, page, index);
      expect(button(detail, index === 0 ? 'Add to queue' : 'Remove from queue')).toBeDefined();
      expect(button(detail, 'Add to Deck')).toBeUndefined();
      expect(button(detail, 'Remove from Deck')).toBeUndefined();
      button(detail, 'Close')!.click();
      await fixture.whenStable();
    }
  });
});
