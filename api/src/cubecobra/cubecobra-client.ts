import { Injectable } from '@nestjs/common';
import {
  fetchWithTimeout,
  UnreachableError,
} from '../http/fetch-with-timeout.js';

const SITE = 'https://cubecobra.com';
/** Scryfall's oracle ids are UUIDs; anything else would break the search for printings. */
const ORACLE_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** How long fetching a cube, its body included, may take: a cube's JSON can be large. */
const REQUEST_TIMEOUT_MS = 20_000;
const HEADERS = {
  'User-Agent':
    'Swantisserie/1.0 (+https://github.com/Clutchison/swantisserie)',
  Accept: 'application/json',
};

/** One copy of a card in a cube's mainboard. */
export interface CubeCard {
  /** The card's identity across printings, as Scryfall gives it. */
  oracleId: string;
  name: string;
}

/** A cube as a draft's pool needs it. */
export interface Cube {
  name: string;
  /** Each copy listed separately, in CubeCobra's order. */
  mainboard: CubeCard[];
}

/**
 * CubeCobra couldn't be asked, failed, or answered with something we can't
 * read: its JSON endpoint isn't formally documented, so it could change.
 */
export class CubeCobraUnavailableError extends Error {}

/** CubeCobra's cubes: the boundary faked in tests. */
export abstract class CubeCobraClient {
  /**
   * The public cube with this id, or null if CubeCobra has none: a private
   * cube looks the same as a missing one. Throws CubeCobraUnavailableError
   * if CubeCobra can't say.
   */
  abstract cube(cubeId: string): Promise<Cube | null>;
}

/** Where people see the cube on CubeCobra. */
export function cubeUrl(cubeId: string): string {
  return `${SITE}/cube/overview/${encodeURIComponent(cubeId)}`;
}

@Injectable()
export class FetchCubeCobraClient extends CubeCobraClient {
  async cube(cubeId: string): Promise<Cube | null> {
    let res: Response;
    try {
      res = await fetchWithTimeout(
        `${SITE}/cube/api/cubeJSON/${encodeURIComponent(cubeId)}`,
        { headers: HEADERS },
        REQUEST_TIMEOUT_MS,
      );
    } catch (err) {
      throw unreachable(err);
    }
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new CubeCobraUnavailableError(`CubeCobra answered ${res.status}.`);
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch (err) {
      if (err instanceof UnreachableError) throw unreachable(err);
      throw new CubeCobraUnavailableError(
        'CubeCobra didn’t answer with JSON.',
        {
          cause: err,
        },
      );
    }
    return toCube(body);
  }
}

function unreachable(cause: unknown): CubeCobraUnavailableError {
  return new CubeCobraUnavailableError('CubeCobra could not be reached.', {
    cause,
  });
}

/** The cube in CubeCobra's answer, checked field by field. */
function toCube(body: unknown): Cube {
  const malformed = (what: string) =>
    new CubeCobraUnavailableError(`CubeCobra’s cube has ${what}.`);
  if (!isRecord(body) || typeof body.name !== 'string') {
    throw malformed('no name');
  }
  const mainboard = isRecord(body.cards) ? body.cards.mainboard : undefined;
  if (!Array.isArray(mainboard)) throw malformed('no mainboard');
  return {
    name: body.name,
    mainboard: mainboard.map((card: unknown) => {
      const details = isRecord(card) ? card.details : undefined;
      if (
        !isRecord(details) ||
        typeof details.oracle_id !== 'string' ||
        !ORACLE_ID.test(details.oracle_id) ||
        typeof details.name !== 'string'
      ) {
        throw malformed('a card with no oracle id or name');
      }
      return { oracleId: details.oracle_id, name: details.name };
    }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
