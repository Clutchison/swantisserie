import { TestBed } from '@angular/core/testing';
import {
  useDraftsApp,
  tabButton,
  panel,
  wait,
  viewOn,
  previewImage,
  previewImages,
  ownTabStop,
  pointer,
  tap,
  queueOf,
  button,
  cardName,
  startDrag,
} from './harness';
import { planOf, planned } from './plan-tab-harness';
import { image, openDetail } from './pool-tab-harness';
import { openDialog, pressEscape, pressKey } from '../../specs-harness';
import {
  bolt,
  shock,
  hover,
  unhover,
  openBoard,
  openPicked,
  openQueueWithoutBolt,
} from './card-previews-harness';

useDraftsApp();

describe('card previews', () => {
  afterEach(() => vi.useRealTimers());

  describe('from the keyboard', () => {
    /** Tabs to `name`, as a keyboard user does, and renders what came of it. */
    function tabTo(name: HTMLElement) {
      pressKey((document.activeElement as HTMLElement | null) ?? document.body, 'Tab');
      name.focus();
      TestBed.tick();
    }
    /** Tabs on from `name` to somewhere with no Card preview. */
    function tabAway(name: HTMLElement) {
      pressKey(name, 'Tab');
      name.blur();
      TestBed.tick();
    }

    it('opens at once on tabbing to a name on the Board tab', async () => {
      const { page } = await openBoard();
      const name = cardName(panel(page), 'Lightning Bolt');

      expect(name.tabIndex).toBe(0);
      tabTo(name);

      expect(document.activeElement).toBe(name);
      expect(previewImage()?.getAttribute('src')).toBe(image('normal', 'bolt-id'));
    });

    it('closes on tabbing away, and moves to the next name tabbed to', async () => {
      const { page } = await openBoard();
      const bolt = cardName(panel(page), 'Lightning Bolt');

      tabTo(bolt);
      tabTo(cardName(panel(page), 'Shock'));
      expect(previewImages()).toHaveLength(1);
      expect(previewImage()?.getAttribute('src')).toBe(image('normal', 'shock-id'));

      tabAway(cardName(panel(page), 'Shock'));
      expect(previewImage()).toBeNull();
    });

    it('leaves open a preview the mouse has opened on another name', async () => {
      const { page } = await openBoard();
      const bolt = cardName(panel(page), 'Lightning Bolt');

      tabTo(bolt);
      hover(cardName(panel(page), 'Shock'));
      wait(150);
      tabAway(bolt);

      expect(previewImage()?.getAttribute('src')).toBe(image('normal', 'shock-id'));
    });

    it('skips a name with no pool card', async () => {
      const { page } = await openQueueWithoutBolt();

      expect(cardName(panel(page), 'Lightning Bolt').tabIndex).toBe(-1);
      expect(cardName(panel(page), 'Shock').tabIndex).toBe(0);
    });

    it('opens nothing through focus when a name is clicked with a mouse', async () => {
      const { page } = await openBoard();
      const name = cardName(panel(page), 'Lightning Bolt');

      hover(name);
      name.dispatchEvent(pointer('pointerdown', 'mouse'));
      name.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      name.focus();
      name.click();
      TestBed.tick();
      expect(document.activeElement).toBe(name);
      expect(previewImage()).toBeNull();

      wait(149);
      expect(previewImage()).toBeNull();
      wait(1);
      expect(previewImage()?.getAttribute('src')).toBe(image('normal', 'bolt-id'));
    });

    it('closes on Escape however it opened, leaving focus where it was', async () => {
      const { page } = await openBoard();
      const name = cardName(panel(page), 'Lightning Bolt');

      hover(name);
      wait(150);
      pressEscape();
      expect(previewImage()).toBeNull();
      unhover(name);

      tap(name);
      pressEscape();
      expect(previewImage()).toBeNull();

      tabTo(name);
      pressEscape();
      expect(previewImage()).toBeNull();
      expect(document.activeElement).toBe(name);
    });

    it('cancels a pending hover on Escape', async () => {
      const { page } = await openBoard();

      hover(cardName(panel(page), 'Lightning Bolt'));
      wait(100);
      pressEscape();
      wait(500);

      expect(previewImage()).toBeNull();
    });

    it('closes the Pool tab’s Card detail on the same Escape', async () => {
      const { fixture, page } = await openBoard();
      tap(cardName(panel(page), 'Lightning Bolt'));
      tabButton(page, 'Pool').click();
      vi.useRealTimers();
      await fixture.whenStable();
      expect(await openDetail(fixture, page, 0)).not.toBeNull();
      expect(previewImage()).not.toBeNull();

      pressEscape();
      await fixture.whenStable();

      expect(previewImage()).toBeNull();
      expect(openDialog()).toBeNull();
    });

    it('opens on names tabbed to on the Export tab', async () => {
      const { fixture, page } = await openBoard();
      tabButton(page, 'Export').click();
      vi.useRealTimers();
      await fixture.whenStable();

      tabTo(ownTabStop(panel(page), 'Lightning Bolt')!);

      expect(previewImage()?.getAttribute('src')).toBe(image('normal', 'bolt-id'));
    });

    it('opens on names tabbed to on the Queue tab, but not while a drag is under way', async () => {
      const opened = await openPicked({
        queue: queueOf({ cards: [{ poolCardId: shock.id, name: shock.name }] }),
      });
      const { page, fixture } = opened;
      tabButton(page, 'Queue').click();
      await fixture.whenStable();
      const name = ownTabStop(panel(page), 'Shock')!;

      tabTo(name);
      expect(previewImage()?.getAttribute('src')).toBe(image('normal', 'shock-id'));
      tabAway(name);

      startDrag(fixture, name);
      tabTo(name);
      expect(previewImage()).toBeNull();
    });

    it('opens on list mode names, which are buttons there, tabbed to on the Plan tab', async () => {
      const { page, fixture } = await openPicked({
        plan: {
          mainboard: [{ poolCardId: bolt.id, name: bolt.name, picked: true }],
          sideboard: [],
          basics: [],
          lost: [],
          preferredPrintings: {},
        },
      });
      tabButton(page, 'Plan').click();
      await fixture.whenStable();

      tabTo(button(panel(page), 'Lightning Bolt')!);

      expect(previewImage()?.getAttribute('src')).toBe(image('normal', 'bolt-id'));
    });

    it('opens on names tabbed to on the Plan tab, but not while a drag is under way', async () => {
      const { page, fixture } = await openPicked({ plan: planOf({ mainboard: [planned(bolt)] }) });
      tabButton(page, 'Plan').click();
      await fixture.whenStable();
      const name = button(panel(page), 'Lightning Bolt')!;

      startDrag(fixture, name);
      tabTo(name);

      expect(previewImage()).toBeNull();
    });

    it('adds no Tab stop for a card shown in stacks mode', async () => {
      viewOn('desktop');
      try {
        const { page, fixture } = await openPicked({
          plan: {
            mainboard: [{ poolCardId: bolt.id, name: bolt.name, picked: true }],
            sideboard: [],
            basics: [],
            lost: [],
            preferredPrintings: {},
          },
        });
        tabButton(page, 'Plan').click();
        await fixture.whenStable();

        expect(panel(page).querySelector('img[alt="Lightning Bolt"]')).not.toBeNull();
        expect(ownTabStop(panel(page), 'Lightning Bolt')).toBeUndefined();
      } finally {
        vi.unstubAllGlobals();
        localStorage.clear();
      }
    });
  });
});
