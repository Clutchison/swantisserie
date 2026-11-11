import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { DecklistView, PoolCardView } from 'contract';
import { CardImageSource } from './card-image-source';
import { CardPreviews } from './card-preview';
import { Decklist } from './decklist';
import { heading, items, namedList, poolCardOf, previewImage, tap } from './specs/harness';

const bolt = poolCardOf('bolt', 'Lightning Bolt');
const shock = poolCardOf('shock', 'Shock');

const ZEN_MOUNTAIN = 'e0000000-0000-4000-8000-000000000243';
const zenMountain = {
  scryfallId: ZEN_MOUNTAIN,
  set: 'zen',
  collectorNumber: '243',
  images: {
    small: `https://cards.scryfall.io/small/front/e/0/${ZEN_MOUNTAIN}.jpg`,
    normal: `https://cards.scryfall.io/normal/front/e/0/${ZEN_MOUNTAIN}.jpg`,
    large: `https://cards.scryfall.io/large/front/e/0/${ZEN_MOUNTAIN}.jpg`,
  },
};

/** Alice's decklist: two Bolts, two Islands and 36 Mountains, Shock in the sideboard; she prefers Zendikar's Mountain #243. */
const alices: DecklistView = {
  playerId: 'alice',
  mainboard: [
    { poolCardId: bolt.id, name: bolt.name, picked: true },
    { poolCardId: 'bolt-2', name: bolt.name, picked: true },
  ],
  sideboard: [{ poolCardId: shock.id, name: shock.name, picked: true }],
  basics: [
    { land: 'Island', count: 2 },
    { land: 'Mountain', count: 36 },
  ],
  preferredPrintings: { Mountain: zenMountain },
};

/** A page outside the draft page: it provides the Card preview, but no draft store. */
@Component({
  imports: [Decklist],
  providers: [CardImageSource, CardPreviews],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-decklist [decklist]="decklist" playerName="Alice" [cards]="cards" />`,
})
class Host {
  decklist = alices;
  cards: ReadonlyMap<string, PoolCardView> = new Map([bolt, shock].map((card) => [card.id, card]));
}

function render(fields: Partial<Host> = {}) {
  const fixture = TestBed.createComponent(Host);
  Object.assign(fixture.componentInstance, fields);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

/** Taps the card named `name` in `list`, returning its Card preview's image. */
function preview(page: HTMLElement, list: string, name: string) {
  const target = [...namedList(page, list).querySelectorAll<HTMLElement>('.name')].find(
    (element) => element.textContent?.trim() === name,
  )!;
  tap(target);
  return previewImage()?.getAttribute('src');
}

describe('a decklist', () => {
  it('lists the mainboard, basic lands last, and the sideboard, under its player’s name', () => {
    const page = render();

    expect(heading(page, 'Alice')).toBeDefined();
    expect(heading(page, 'Mainboard 40')).toBeDefined();
    expect(items(page, 'Alice’s mainboard')).toEqual([
      '2 Lightning Bolt',
      '2 Island',
      '36 Mountain',
    ]);
    expect(heading(page, 'Sideboard 1')).toBeDefined();
    expect(items(page, 'Alice’s sideboard')).toEqual(['1 Shock']);
  });

  it('says a board with no cards has none', () => {
    const page = render({ decklist: { ...alices, sideboard: [] } });

    expect(items(page, 'Alice’s sideboard')).toEqual(['No cards.']);
  });

  it('previews each card from the cards it is given, and each basic land in its player’s preferred printing', () => {
    const page = render();

    expect(preview(page, 'Alice’s mainboard', 'Lightning Bolt')).toBe(bolt.images[0]!.normal);
    expect(preview(page, 'Alice’s mainboard', 'Mountain')).toBe(zenMountain.images.normal);
  });

  it('lists a card it is given no card data for by name alone, with no Card preview', () => {
    const page = render({ cards: new Map() });

    expect(items(page, 'Alice’s mainboard')[0]).toBe('2 Lightning Bolt');
    expect(preview(page, 'Alice’s mainboard', 'Lightning Bolt')).toBeUndefined();
  });
});
