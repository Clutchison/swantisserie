import { useDraftsApp, openDraft, completeSnapshot, button } from './harness';
import { useTallScreen, image, shivan, brightclimb, openDetail } from './pool-tab-harness';

useDraftsApp();
useTallScreen();

describe('pool tab', () => {
  it('opens a card’s large image when it is tapped, and closes it again', async () => {
    const { fixture, page } = await openDraft(
      completeSnapshot,
      {},
      { cards: [brightclimb, shivan] },
    );

    const detail = await openDetail(fixture, page, 1);
    expect(detail.getAttribute('aria-label')).toBe('Shivan Dragon');
    expect(detail.querySelector('img')?.getAttribute('src')).toBe(image('large', 'shivan-id'));
    expect(button(detail, 'Flip')).toBeUndefined();

    button(detail, 'Close')!.click();
    await fixture.whenStable();
    expect(page.querySelector('[role="dialog"]')).toBeNull();
  });

  it('flips a double-faced card between its faces', async () => {
    const { fixture, page } = await openDraft(
      completeSnapshot,
      {},
      { cards: [brightclimb, shivan] },
    );

    const detail = await openDetail(fixture, page, 0);
    const img = () => detail.querySelector('img')?.getAttribute('src');
    expect(img()).toBe(image('large', 'brightclimb-id', 'front'));

    button(detail, 'Flip')!.click();
    await fixture.whenStable();
    expect(img()).toBe(image('large', 'brightclimb-id', 'back'));

    button(detail, 'Flip')!.click();
    await fixture.whenStable();
    expect(img()).toBe(image('large', 'brightclimb-id', 'front'));
  });

  it('falls back to Scryfall’s API image of the face shown when a detail image fails to load', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, {}, { cards: [brightclimb] });

    const detail = await openDetail(fixture, page, 0);
    button(detail, 'Flip')!.click();
    await fixture.whenStable();
    detail.querySelector('img')!.dispatchEvent(new Event('error'));
    await fixture.whenStable();

    expect(detail.querySelector('img')?.getAttribute('src')).toBe(
      'https://api.scryfall.com/cards/brightclimb-id?format=image&version=large&face=back',
    );
  });
});
