import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { DecklistView, PoolCardView } from 'contract';
import { CardImageSource } from './card-image-source';
import { CardPreviews } from './card-preview';
import { Decklist } from './decklist';
import { heading, items, poolCardOf, previewInList } from './specs/harness';
import { zenMountain } from './specs/plan-tab-harness';

const bolt = poolCardOf('bolt', 'Lightning Bolt');
const shock = poolCardOf('shock', 'Shock');

/** Alice's decklist: two Bolts, two Islands and 36 Mountains, Shock in the sideboard; she prefers Zendikar's Mountain #243. */
const alices: DecklistView = {
  playerId: 'alice',
  mainboard: [
    { poolCardId: bolt.id, name: bolt.name, picked: true },
    { poolCardId: 'bolt-2', name: bolt.name, picked: true },
  ],
  sideboard: [{ poolCardId: shock.id, name: shock.name, picked: true }],
  basics: [
    { land: 'Island', board: 'Mainboard', count: 2 },
    { land: 'Mountain', board: 'Mainboard', count: 36 },
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

/** A page showing two of Alice's decklists, as the Trophy Hall does for a player with two trophies. */
@Component({
  imports: [Decklist],
  providers: [CardImageSource, CardPreviews],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-decklist
      [decklist]="decklist"
      playerName="Alice"
      [cards]="cards"
      idPrefix="first"
    />
    <app-decklist [decklist]="decklist" playerName="Alice" [cards]="cards" idPrefix="second" />`,
})
class TwoDecks {
  decklist = alices;
  cards: ReadonlyMap<string, PoolCardView> = new Map();
}

function render(fields: Partial<Host> = {}) {
  const fixture = TestBed.createComponent(Host);
  Object.assign(fixture.componentInstance, fields);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
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

    expect(previewInList(page, 'Alice’s mainboard', 'Lightning Bolt')).toBe(bolt.images[0]!.normal);
    expect(previewInList(page, 'Alice’s mainboard', 'Mountain')).toBe(zenMountain.images.normal);
  });

  it('lists a card it is given no card data for by name alone, with no Card preview', () => {
    const page = render({ cards: new Map() });

    expect(items(page, 'Alice’s mainboard')[0]).toBe('2 Lightning Bolt');
    expect(previewInList(page, 'Alice’s mainboard', 'Lightning Bolt')).toBeUndefined();
  });

  it('keeps its ids apart from another decklist of the same player, given another id prefix', () => {
    const fixture = TestBed.createComponent(TwoDecks);
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;

    const ids = [...page.querySelectorAll('[id]')].map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
    const regions = [...page.querySelectorAll<HTMLElement>('[aria-labelledby]')];
    expect(
      regions.map(
        (region) => page.querySelector(`#${region.getAttribute('aria-labelledby')}`)?.textContent,
      ),
    ).toEqual(['Alice', 'Alice']);
  });
});
