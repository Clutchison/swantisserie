import { describe, expect, it } from 'vitest';
import { readPickImport } from './pick-import.js';

/** A pool card whose oracle id is its name, in lower case. */
const card = (name: string) => ({ oracleId: name.toLowerCase(), name });
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
const size = { players: 2, picksPerPlayer: 3 };

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
        { number: 1, seat: 0, oracleId: 'ash golem' },
        { number: 2, seat: 1, oracleId: 'vex, the quiet' },
        { number: 3, seat: 1, oracleId: 'brine wisp' },
        { number: 4, seat: 0, oracleId: 'cinder hound' },
      ],
      next: { pick: 5, round: 3, seat: 0 },
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
        picks: [{ number: 1, seat: 0, oracleId: 'ash golem' }],
        next: { pick: 2, seat: 1 },
      });
    });

    it('takes a file with no last column', () => {
      expect(read(',Ann,Ben\n->,Ash Golem,Brine Wisp')).toMatchObject({
        ok: true,
        columns: ['Ann', 'Ben'],
        next: { pick: 3, seat: 1 },
      });
    });

    it('reads a doubled quote in a quoted name', () => {
      const cards = [card('The "Big" One')];
      const csv = ',Ann,Ben,\n->,"The ""Big"" One",,';

      expect(read(csv, size, cards)).toMatchObject({
        ok: true,
        picks: [{ oracleId: 'the "big" one' }],
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
      const threePlayers = { players: 3, picksPerPlayer: 3 };

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
        picks: [{ oracleId: 'ash golem' }, { oracleId: 'vex, the quiet' }],
      });
    });

    it.each(['Spring // Autumn', 'spring'])(
      'matches %s on the full or the front-face name',
      (name) => {
        expect(read(`,Ann,Ben,\n->,${name},,`)).toMatchObject({
          ok: true,
          picks: [{ oracleId: 'spring // autumn' }],
        });
      },
    );

    it('does not match the back-face name, or fuzzily', () => {
      expect(problems(',Ann,Ben,\n->,Autumn,Ash Golm,')).toEqual([
        'Autumn isn’t in this draft’s pool.',
        'Ash Golm isn’t in this draft’s pool.',
      ]);
    });

    it('refuses a name that matches more than one pool card', () => {
      const cards = [card('Spring'), card('Spring // Autumn')];

      expect(problems(',Ann,Ben,\n->,spring,,', size, cards)).toEqual([
        'spring matches more than one pool card: Spring, Spring // Autumn.',
      ]);
    });

    it('refuses the same card twice, however it is named', () => {
      const csv = ',Ann,Ben,\n->,Spring,Spring // Autumn,';

      expect(problems(csv)).toEqual([
        'Spring // Autumn appears more than once.',
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

      expect(problems(csv, { players: 2, picksPerPlayer: 2 })).toEqual([
        'The file makes every pick in the draft, so there would be nothing left to draft.',
      ]);
    });

    it('refuses more picks than the draft allows', () => {
      const csv =
        ',Ann,Ben,\n->,Ash Golem,Brine Wisp,\n,Cinder Hound,Dusk Heron,<-\n->,Ember Stag,,';

      expect(problems(csv, { players: 2, picksPerPlayer: 2 })).toEqual([
        'The file has 5 picks, but the draft allows 4.',
      ]);
    });
  });

  it('reports every problem in a file together', () => {
    const csv = [
      ',Ann,Ben,Cid,',
      '->,Ash Golem,,Ash Golem,',
      ',Unknown Card,,,<-',
    ].join('\n');

    expect(problems(csv, { players: 2, picksPerPlayer: 1 })).toEqual([
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
