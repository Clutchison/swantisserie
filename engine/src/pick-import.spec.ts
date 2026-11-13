import { describe, expect, it } from 'vitest';
import { readPickImport } from './pick-import.js';

/** A pool card whose id is its name, in lower case. */
const card = (name: string) => ({ id: name.toLowerCase(), name });
const pool = [
  'Ash Golem',
  'Brine Wisp',
  'Cinder Hound',
  'Dusk Heron',
  'Ember Stag',
  'Fen Lurker',
  'Vex, the Quiet',
  'Spring // Autumn',
].map(card);
const size = { players: 2, picksPerPlayer: 3, doublePicks: 0 };

const read = (csv: string, draftSize = size, cards = pool) =>
  readPickImport(csv, draftSize, cards);

describe('readPickImport', () => {
  it('reads picks in snake order, with the columns and next turn', () => {
    const csv = [
      ',Ann,Ben,',
      '->,Ash Golem,"Vex, the Quiet",',
      ',Cinder Hound,Brine Wisp,<-',
    ].join('\n');

    expect(read(csv)).toEqual({
      ok: true,
      columns: ['Ann', 'Ben'],
      picks: [
        { number: 1, seat: 0, poolCardId: 'ash golem' },
        { number: 2, seat: 1, poolCardId: 'vex, the quiet' },
        { number: 3, seat: 1, poolCardId: 'brine wisp' },
        { number: 4, seat: 0, poolCardId: 'cinder hound' },
      ],
      next: { pick: 5, round: 3, seat: 0, picksBeforeTurnPasses: 1 },
    });
  });

  /** The problems with `csv`, which must be refused. */
  function problems(csv: string, draftSize = size, cards = pool) {
    const reading = read(csv, draftSize, cards);
    if (reading.ok) throw new Error('Expected the file to be refused');
    return reading.problems;
  }

  describe('layout', () => {
    it('ignores blank rows, spaces-only cells, a byte order mark and CRLF', () => {
      const csv =
        '﻿,Ann,Ben,\r\n->,Ash Golem, ,\r\n, , ,<-\r\n->,,,\r\n,,,<-\r\n';

      expect(read(csv)).toMatchObject({
        ok: true,
        picks: [{ number: 1, seat: 0, poolCardId: 'ash golem' }],
        next: { pick: 2, seat: 1 },
      });
    });

    describe('empty lines', () => {
      const header = ',Ann,Ben,';
      const round1 = '->,Ash Golem,Brine Wisp,';
      const round2 = ',,Cinder Hound,<-';
      const without = [header, round1, round2].join('\n');

      it('reads the file the same without them', () => {
        expect(read(without)).toMatchObject({
          ok: true,
          picks: [
            { number: 1, seat: 0, poolCardId: 'ash golem' },
            { number: 2, seat: 1, poolCardId: 'brine wisp' },
            { number: 3, seat: 1, poolCardId: 'cinder hound' },
          ],
          next: { pick: 4, round: 2, seat: 0 },
        });
      });

      it.each(['', ',,,', ' , , , '])('skips “%s” between rounds', (line) => {
        const csv = [header, round1, line, round2].join('\n');

        expect(read(csv)).toEqual(read(without));
      });

      it('skips empty lines before the header', () => {
        const csv = ['', ',,,', header, round1, round2].join('\n');

        expect(read(csv)).toEqual(read(without));
      });

      it('still counts a round with only a direction marker', () => {
        const csv = [header, '->,,,', ',Ash Golem,Brine Wisp,<-'].join('\n');

        expect(problems(csv)).toEqual([
          'Round 1 has no pick for Ann, but later picks are filled in.',
          'Round 1 has no pick for Ben, but later picks are filled in.',
        ]);
      });
    });

    it('takes a file with no last column', () => {
      expect(read(',Ann,Ben\n->,Ash Golem,Brine Wisp')).toMatchObject({
        ok: true,
        columns: ['Ann', 'Ben'],
        next: { pick: 3, seat: 1 },
      });
    });

    it('reads cells missing from the end of a short row as empty', () => {
      expect(read(',Ann,Ben,\n->,Ash Golem')).toMatchObject({
        ok: true,
        picks: [{ number: 1, seat: 0, poolCardId: 'ash golem' }],
        next: { pick: 2, seat: 1 },
      });
    });

    it('reads a doubled quote in a quoted name', () => {
      const cards = [card('The "Big" One')];
      const csv = ',Ann,Ben,\n->,"The ""Big"" One",,';

      expect(read(csv, size, cards)).toMatchObject({
        ok: true,
        picks: [{ poolCardId: 'the "big" one' }],
      });
    });

    it('refuses an empty file', () => {
      expect(problems('')).toEqual(['The file has no header row.']);
    });

    it('refuses a quote that is never closed', () => {
      expect(problems(',Ann,Ben,\n->,"Ash Golem,Brine Wisp,')).toEqual([
        'The file has a quote that is never closed.',
      ]);
    });

    it('refuses a header with no blank first cell or with a nameless column', () => {
      const threePlayers = { players: 3, picksPerPlayer: 3, doublePicks: 0 };

      expect(problems('Ann,Ben,,Cid,\n->,Ash Golem,,,', threePlayers)).toEqual([
        'The header’s first cell must be blank.',
        'Column 2 of the header has no player name.',
      ]);
    });

    it('refuses anything but a direction marker in the first and last columns', () => {
      expect(
        problems(',Ann,Ben,\nAsh Golem,Brine Wisp,Cinder Hound,Dusk Heron'),
      ).toEqual([
        'Round 1 has “Ash Golem” outside the player columns.',
        'Round 1 has “Dusk Heron” outside the player columns.',
      ]);
    });

    it('refuses a direction marker that contradicts snake order', () => {
      const csv = [
        ',Ann,Ben,',
        '<-,Ash Golem,Brine Wisp,',
        '->,,Cinder Hound,',
        ',,,->',
      ].join('\n');

      expect(problems(csv)).toEqual([
        'Round 1 is marked <- but runs -> in snake order.',
        'Round 2 is marked -> but runs <- in snake order.',
      ]);
    });

    it('refuses a contradicting direction marker in the last column', () => {
      expect(problems(',Ann,Ben,\n->,Ash Golem,Brine Wisp,<-')).toEqual([
        'Round 1 is marked <- but runs -> in snake order.',
      ]);
    });

    it('refuses cells past the last column', () => {
      expect(
        problems(',Ann,Ben,\n->,Ash Golem,Brine Wisp,,Ember Stag'),
      ).toEqual(['Round 1 has “Ember Stag” outside the player columns.']);
    });
  });

  describe('players', () => {
    it('refuses a different number of player columns than players', () => {
      const csv = ',Ann,Ben,Cid,\n->,Ash Golem,Brine Wisp,Cinder Hound,';

      expect(problems(csv)).toEqual([
        'The file has 3 player columns, but the draft has 2 players.',
      ]);
    });
  });

  describe('gaps', () => {
    it('refuses an empty cell before a filled one in snake order', () => {
      // Round 2 runs from Ben back to Ann, so Ben's cell comes first.
      const csv = ',Ann,Ben,\n->,Ash Golem,Brine Wisp,\n,Cinder Hound,,<-';

      expect(problems(csv)).toEqual([
        'Round 2 has no pick for Ben, but later picks are filled in.',
      ]);
    });

    it('names a column with no player name by its number', () => {
      const threePlayers = { players: 3, picksPerPlayer: 3, doublePicks: 0 };
      const csv = ',Ann,,Cid,\n->,Ash Golem,,Brine Wisp,';

      expect(problems(csv, threePlayers)).toEqual([
        'Column 2 of the header has no player name.',
        'Round 1 has no pick for column 2, but later picks are filled in.',
      ]);
    });

    it('allows an empty cell after the last filled one in snake order', () => {
      const csv = ',Ann,Ben,\n->,Ash Golem,Brine Wisp,\n,,Cinder Hound,<-';

      expect(read(csv)).toMatchObject({ ok: true, next: { pick: 4, seat: 0 } });
    });
  });

  describe('card names', () => {
    it('matches ignoring case and surrounding spaces', () => {
      const csv = ',Ann,Ben,\n->,  aSH gOLEM ,"VEX, THE QUIET",';

      expect(read(csv)).toMatchObject({
        ok: true,
        picks: [{ poolCardId: 'ash golem' }, { poolCardId: 'vex, the quiet' }],
      });
    });

    it.each(['Spring // Autumn', 'spring'])(
      'matches %s on the full or the front-face name',
      (name) => {
        expect(read(`,Ann,Ben,\n->,${name},,`)).toMatchObject({
          ok: true,
          picks: [{ poolCardId: 'spring // autumn' }],
        });
      },
    );

    it('does not match the back-face name, or fuzzily', () => {
      expect(problems(',Ann,Ben,\n->,Autumn,Ash Golm,')).toEqual([
        'Autumn isn’t in this draft’s pool.',
        'Ash Golm isn’t in this draft’s pool.',
      ]);
    });

    it('prefers a card whose full name matches over one whose front face does', () => {
      const cards = [card('Spring // Autumn'), card('Spring')];

      expect(read(',Ann,Ben,\n->,spring,,', size, cards)).toMatchObject({
        ok: true,
        picks: [{ poolCardId: 'spring' }],
      });
    });

    it('imports a card and another with its name as their front face', () => {
      const cards = [card('Spring // Autumn'), card('Spring')];
      const csv = ',Ann,Ben,\n->,Spring,Spring // Autumn,';

      expect(read(csv, size, cards)).toMatchObject({
        ok: true,
        picks: [{ poolCardId: 'spring' }, { poolCardId: 'spring // autumn' }],
      });
    });

    it('refuses a front-face name that matches more than one pool card', () => {
      const cards = [card('Spring // Autumn'), card('Spring // Summer')];

      expect(problems(',Ann,Ben,\n->,spring,,', size, cards)).toEqual([
        'spring matches more than one pool card: Spring // Autumn, Spring // Summer.',
      ]);
    });

    it('refuses the same card twice, however it is named', () => {
      const csv = ',Ann,Ben,\n->,Spring,Spring // Autumn,';

      expect(problems(csv)).toEqual([
        'Spring // Autumn appears more than once.',
      ]);
    });
  });

  describe('copies', () => {
    /** Two copies of Ash Golem, with ids ash golem 1 and ash golem 2. */
    const copies = [
      { id: 'ash golem 1', name: 'Ash Golem' },
      { id: 'ash golem 2', name: 'Ash Golem' },
      card('Brine Wisp'),
      card('Spring // Autumn'),
      { id: 'spring // autumn 2', name: 'Spring // Autumn' },
    ];

    it('maps each use of a name to the next unpicked copy', () => {
      const csv = ',Ann,Ben,\n->,Ash Golem,ash golem,\n,,Brine Wisp,<-';

      expect(read(csv, size, copies)).toMatchObject({
        ok: true,
        picks: [
          { seat: 0, poolCardId: 'ash golem 1' },
          { seat: 1, poolCardId: 'ash golem 2' },
          { seat: 1, poolCardId: 'brine wisp' },
        ],
      });
    });

    it('counts a card’s copies however it is named', () => {
      const csv = ',Ann,Ben,\n->,Spring,Spring // Autumn,';

      expect(read(csv, size, copies)).toMatchObject({
        ok: true,
        picks: [
          { poolCardId: 'spring // autumn' },
          { poolCardId: 'spring // autumn 2' },
        ],
      });
    });

    it('refuses a name used more times than the pool has copies', () => {
      const csv = ',Ann,Ben,\n->,Ash Golem,Ash Golem,\n,,Ash Golem,<-';

      expect(problems(csv, size, copies)).toEqual([
        'Ash Golem appears 3 times, but the pool has 2 copies.',
      ]);
    });

    it('counts only the uses of that card, among other picks and unknown names', () => {
      const csv = [
        ',Ann,Ben,',
        '->,Ash Golem,Ash Golem,',
        ',Unknown Card,Brine Wisp,<-',
        '->,Ash Golem,,',
      ].join('\n');

      expect(problems(csv, size, copies)).toEqual([
        'Unknown Card isn’t in this draft’s pool.',
        'Ash Golem appears 3 times, but the pool has 2 copies.',
      ]);
    });
  });

  describe('pick count', () => {
    it('refuses a file with no picks', () => {
      expect(problems(',Ann,Ben,\n->,,,\n,,,<-')).toEqual([
        'The file has no picks.',
      ]);
    });

    it('refuses a file with every pick in the draft already made', () => {
      const csv =
        ',Ann,Ben,\n->,Ash Golem,Brine Wisp,\n,Cinder Hound,Dusk Heron,<-';

      expect(
        problems(csv, { players: 2, picksPerPlayer: 2, doublePicks: 0 }),
      ).toEqual([
        'The file makes every pick in the draft, so there would be nothing left to draft.',
      ]);
    });

    it('refuses more picks than the draft allows', () => {
      const csv =
        ',Ann,Ben,\n->,Ash Golem,Brine Wisp,\n,Cinder Hound,Dusk Heron,<-\n->,Ember Stag,,';

      expect(
        problems(csv, { players: 2, picksPerPlayer: 2, doublePicks: 0 }),
      ).toEqual(['The file has 5 picks, but the draft allows 4.']);
    });

    it('takes each row past the draft’s last round as a round of its own', () => {
      const csv = [
        ',Ann,Ben,',
        '->,Ash Golem,Brine Wisp,',
        ',Cinder Hound,Dusk Heron,<-',
        '->,Ember Stag,,',
        ',,,<-',
        '->,,,',
      ].join('\n');

      expect(
        problems(csv, { players: 2, picksPerPlayer: 2, doublePicks: 0 }),
      ).toEqual(['The file has 5 picks, but the draft allows 4.']);
    });
  });

  describe('double picks', () => {
    // A round of single turns, A B, then two rounds of double turns:
    // B B A A, then A A B B.
    const doubles = { players: 2, picksPerPlayer: 5, doublePicks: 4 };
    const cards = [
      ...pool,
      ...['Gale Kite', 'Hollow Elk', 'Iron Moth', 'Jade Viper'].map(card),
    ];
    const header = ',Ann,Ben,';
    const single = '->,Ash Golem,Brine Wisp,';

    const pairs = [
      ',Cinder Hound,Dusk Heron,<-',
      ',Ember Stag,Fen Lurker,<-',
      '->,Gale Kite,Hollow Elk,',
      '->,Iron Moth,,',
    ];

    it('reads a round of double turns from two rows, seat by seat across the pair', () => {
      const csv = [header, single, ...pairs].join('\n');

      expect(read(csv, doubles, cards)).toEqual({
        ok: true,
        columns: ['Ann', 'Ben'],
        picks: [
          { number: 1, seat: 0, poolCardId: 'ash golem' },
          { number: 2, seat: 1, poolCardId: 'brine wisp' },
          { number: 3, seat: 1, poolCardId: 'dusk heron' },
          { number: 4, seat: 1, poolCardId: 'fen lurker' },
          { number: 5, seat: 0, poolCardId: 'cinder hound' },
          { number: 6, seat: 0, poolCardId: 'ember stag' },
          { number: 7, seat: 0, poolCardId: 'gale kite' },
          { number: 8, seat: 0, poolCardId: 'iron moth' },
          { number: 9, seat: 1, poolCardId: 'hollow elk' },
        ],
        next: { pick: 10, round: 3, seat: 1, picksBeforeTurnPasses: 1 },
      });
    });

    it('skips blank lines inside and between a round’s two rows, as they aren’t rows', () => {
      const [first, second, third, fourth] = pairs;
      const csv = [header, single, first, '', second, ',,,', third, fourth];

      expect(read(csv.join('\n'), doubles, cards)).toEqual(
        read([header, single, ...pairs].join('\n'), doubles, cards),
      );
    });

    it('takes each row past the draft’s last round as a round of its own', () => {
      const csv = [
        header,
        '->,Ash Golem,Brine Wisp,',
        '->,Cinder Hound,Dusk Heron,',
        ',Ember Stag,Fen Lurker,<-',
        ',Gale Kite,Hollow Elk,<-',
        '->,Iron Moth,,',
        ',,,<-',
      ].join('\n');

      expect(
        problems(csv, { players: 2, picksPerPlayer: 2, doublePicks: 2 }, cards),
      ).toEqual(['The file has 9 picks, but the draft allows 4.']);
    });

    it('leaves the turn with the player after the first pick of their double turn', () => {
      const csv = [header, single, ',,Dusk Heron,<-'].join('\n');

      expect(read(csv, doubles, cards)).toMatchObject({
        ok: true,
        picks: [
          { number: 1, seat: 0 },
          { number: 2, seat: 1 },
          { number: 3, seat: 1, poolCardId: 'dusk heron' },
        ],
        next: { pick: 4, round: 2, seat: 1, picksBeforeTurnPasses: 1 },
      });
    });

    it.each([
      [
        ',,Dusk Heron,->\n,,,<-',
        'Round 2 is marked -> but runs <- in snake order.',
      ],
      [
        ',,Dusk Heron,<-\n->,,,',
        'Round 2 is marked -> but runs <- in snake order.',
      ],
      [
        ',,Dusk Heron,<-\n,,,<-\n<-,,,\n',
        'Round 3 is marked <- but runs -> in snake order.',
      ],
      [
        ',,Dusk Heron,<-\n,,,<-\n,,,\n,,,<-',
        'Round 3 is marked <- but runs -> in snake order.',
      ],
    ])(
      'names the round of a wrong marker on either of its two rows',
      (rows, problem) => {
        const csv = [header, single, rows].join('\n');

        expect(problems(csv, doubles, cards)).toEqual([problem]);
      },
    );

    it('refuses an empty cell before a filled one across the pair', () => {
      const csv = [header, single, ',Cinder Hound,,<-', ',,Fen Lurker,<-'].join(
        '\n',
      );

      expect(problems(csv, doubles, cards)).toEqual([
        'Round 2 has no pick for Ben, but later picks are filled in.',
      ]);
    });
  });

  it('reports every problem in a file together', () => {
    const csv = [
      ',Ann,Ben,Cid,',
      '->,Ash Golem,,Ash Golem,',
      ',Unknown Card,,,<-',
    ].join('\n');

    expect(
      problems(csv, { players: 2, picksPerPlayer: 1, doublePicks: 0 }),
    ).toEqual([
      'The file has 3 player columns, but the draft has 2 players.',
      'Round 1 has no pick for Ben, but later picks are filled in.',
      'Round 2 has no pick for Cid, but later picks are filled in.',
      'Round 2 has no pick for Ben, but later picks are filled in.',
      'Ash Golem appears more than once.',
      'Unknown Card isn’t in this draft’s pool.',
      'The file has 3 picks, but the draft allows 2.',
    ]);
  });
});
