import type { AppFixture } from './harness';
import { completeSnapshot, openDraft, tabPanel, text, useDraftsApp } from './harness';
import { disclosure, hiddenInClosedSection, toggleDisclosure } from './disclosure-harness';

useDraftsApp();

describe('pool tab', () => {
  describe('about this pool', () => {
    const about = (page: HTMLElement) => disclosure(tabPanel(page, 'Pool'), 'About this pool')!;

    /** Opens "About this pool", as a viewer clicking it would. */
    async function openAbout(fixture: AppFixture, page: HTMLElement) {
      toggleDisclosure(tabPanel(page, 'Pool'), 'About this pool');
      await fixture.whenStable();
      return about(page);
    }

    /** Each line "About this pool" shows, as a viewer reads it. */
    const lines = (section: HTMLElement) =>
      [...section.querySelectorAll<HTMLElement>(':scope > p')].map((line) => text(line));

    it('is closed until the viewer opens it, beside the pool’s card count', async () => {
      const { page } = await openDraft(completeSnapshot);

      expect(about(page).open).toBe(false);
      const platform = [...about(page).querySelectorAll('p')].find((line) =>
        text(line).startsWith('Platform:'),
      )!;
      expect(hiddenInClosedSection(platform)).toBe(true);
      expect(text(tabPanel(page, 'Pool'))).toContain('540 cards in the pool.');
    });

    it('shows the draft’s platform beside its pool query once opened', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, { platform: 'MTGO' });

      const section = await openAbout(fixture, page);

      expect(section.open).toBe(true);
      expect(lines(section)).toEqual(['Platform: MTGO', 'Pool query: t:dragon c:r']);
    });

    it('shows the cube a pool came from, linking to it, in place of a pool query', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, {
        platform: 'Arena',
        poolSource: {
          kind: 'cube',
          cube: {
            name: 'The Pauper Cube',
            url: 'https://cubecobra.com/cube/overview/thepaupercube',
          },
        },
      });

      const section = await openAbout(fixture, page);

      expect(lines(section)).toEqual(['Platform: Arena', 'Cube: The Pauper Cube']);
      const link = [...section.querySelectorAll<HTMLAnchorElement>('a')].find(
        (a) => text(a) === 'The Pauper Cube',
      )!;
      expect(link.href).toBe('https://cubecobra.com/cube/overview/thepaupercube');
    });

    it('shows the set list a pool came from, each set by code with its included sublists', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, {
        platform: 'Arena',
        poolSource: {
          kind: 'set-list',
          setList: [
            { code: 'mkm', sublists: [] },
            { code: 'otj', sublists: ['big', 'otp'] },
          ],
        },
      });

      const section = await openAbout(fixture, page);

      expect(lines(section)).toEqual(['Platform: Arena', 'Sets: MKM, OTJ (+ BIG, OTP)']);
    });

    it('is there while the pool is still being snapshotted', async () => {
      const { page } = await openDraft({ state: 'Running', cards: 0, total: null });

      expect(about(page).open).toBe(false);
    });
  });
});
