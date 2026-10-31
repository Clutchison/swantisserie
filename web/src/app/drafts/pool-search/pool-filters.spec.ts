import { describe, expect, it } from 'vitest';
import fixtureCards from './fixtures/cards.json';
import {
  applyPoolFilters,
  colorFilterSearch,
  noPoolFilters,
  poolFilterActive,
  type ColorChoice,
} from './pool-filters';
import { type PoolSearchCard, searchPool } from './pool-search';

const cards = fixtureCards as PoolSearchCard[];

function shownBy(...pressed: ColorChoice[]) {
  return applyPoolFilters(cards, { colors: new Set(pressed) }).map((card) => card.name);
}

describe('color filter', () => {
  it.each<[ColorChoice[], string]>([
    [[], ''],
    [['C'], '-c>=1'],
    [['W'], '(c:w) c<=w'],
    [['W', 'U'], '(c:w or c:u) c<=wu'],
    [['W', 'U', 'C'], '(c:w or c:u or -c>=1) c<=wu'],
    [['W', 'C'], '(c:w or -c>=1) c<=w'],
    [['W', 'U', 'B', 'R', 'G'], '(c:w or c:u or c:b or c:r or c:g) c<=wubrg'],
  ])('turns %j into the search text "%s"', (pressed, text) => {
    expect(colorFilterSearch(new Set(pressed))).toBe(text);
  });

  it('writes colors in the same order, whichever was pressed first', () => {
    expect(colorFilterSearch(new Set<ColorChoice>(['U', 'W']))).toBe('(c:w or c:u) c<=wu');
  });

  describe('on the Scryfall fixtures', () => {
    it('leaves every card when nothing is pressed', () => {
      expect(applyPoolFilters(cards, noPoolFilters)).toEqual(cards);
    });

    it('shows cards whose colors are all among those pressed, and not colorless ones', () => {
      const shown = shownBy('W', 'U');
      expect(shown).toEqual(
        expect.arrayContaining([
          'Elesh Norn // The Argent Etchings', // mono-W
          "Elusive Otter // Grove's Bounty", // mono-U
        ]),
      );
      expect(shown).not.toContain('Brightclimb Pathway // Grimclimb Pathway'); // colorless
      expect(shown).not.toContain('Abandoned Campground'); // a land
      expect(shown).not.toContain('Connive // Concoct'); // UB
    });

    it('adds colorless cards when Colorless is pressed too', () => {
      const shown = shownBy('W', 'U', 'C');
      expect(shown).toContain('Elesh Norn // The Argent Etchings');
      expect(shown).toContain('Abandoned Campground');
      expect(shown).not.toContain('Connive // Concoct');
    });

    it('shows only colorless cards for Colorless alone', () => {
      const shown = shownBy('C');
      expect(shown).toContain('Abandoned Campground');
      expect(shown).not.toContain('Elesh Norn // The Argent Etchings');
    });

    describe('double-faced cards show if any one face fits', () => {
      const emeriasCall = "Emeria's Call // Emeria, Shattered Skyclave"; // W, with a colorless land back
      const aetherblade = 'Aetherblade Agent // Gitaxian Mindstinger'; // B, with a UB back

      it('shows a white card with a colorless back for White, though that face is colorless', () => {
        expect(shownBy('W')).toContain(emeriasCall);
      });

      it('needs more than -c:c to do so, which rules out a card for any colorless face', () => {
        const result = searchPool(cards, 'c<=w -c:c');
        expect(result.ok && result.cards.map((card) => card.name)).not.toContain(emeriasCall);
      });

      it('leaves it out for Colorless, since it is really a white card', () => {
        expect(shownBy('C')).not.toContain(emeriasCall);
        expect(shownBy('U', 'C')).not.toContain(emeriasCall);
      });

      it('still shows it when its color is pressed along with Colorless', () => {
        expect(shownBy('W', 'C')).toContain(emeriasCall);
      });

      it('shows a card with no color on either face for Colorless', () => {
        expect(shownBy('C')).toContain('Brightclimb Pathway // Grimclimb Pathway');
      });

      it('leaves it out for a color neither face has', () => {
        expect(shownBy('U')).not.toContain(emeriasCall);
      });

      it('shows a card for the colors of one face alone', () => {
        expect(shownBy('B')).toContain(aetherblade);
      });

      it('leaves it out for a color that fits no face alone', () => {
        expect(shownBy('U')).not.toContain(aetherblade);
      });
    });
  });
});

describe('pool filters', () => {
  it('are active once a color is pressed', () => {
    expect(poolFilterActive(noPoolFilters)).toBe(false);
    expect(poolFilterActive({ colors: new Set(['G']) })).toBe(true);
  });
});
