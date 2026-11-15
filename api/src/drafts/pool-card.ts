import type { CardFace, CardImages } from 'contract';
import type { Prisma } from '../generated/prisma/client.js';
import type {
  ScryfallCard,
  ScryfallCardFace,
} from '../scryfall/scryfall-client.js';

/** A card face's images, as stored in PoolCard.images. */
interface StoredCardImages extends CardImages {
  /** Keeps the type a Prisma InputJsonObject. */
  [key: string]: string;
}

/** One face's fields for the pool search, as stored in PoolCard.faces. */
interface StoredCardFace extends CardFace {
  /** Keeps the type a Prisma InputJsonObject. */
  [key: string]: string | string[] | null;
}

/** Scryfall gave a printing no oracle id, so it can't be a pool card. */
export class NoOracleIdError extends Error {
  constructor(cardName: string) {
    super(`${cardName} has no oracle id.`);
  }
}

/** Scryfall gave a printing no mana value, or no type line, on the card or its front face, so it can't be a pool card. */
export class MissingCardFieldError extends Error {
  constructor(cardName: string, field: 'mana value' | 'type line') {
    super(`${cardName} has no ${field}.`);
  }
}

/** The card's oracle id: a reversible card's faces carry it. Undefined if Scryfall gave none. */
export function oracleIdOf(card: ScryfallCard): string | undefined {
  return ofCardOrFrontFace(card, 'oracle_id');
}

/** The card's field, else its front face's, as a reversible card's faces carry what the card leaves off. */
function ofCardOrFrontFace<
  K extends keyof ScryfallCard & keyof ScryfallCardFace,
>(
  card: ScryfallCard,
  field: K,
): ScryfallCard[K] | ScryfallCardFace[K] | undefined {
  return card[field] ?? card.card_faces?.[0]?.[field];
}

/** A pool card for the printing, as a draft's own pool cards are created. */
export function toPoolCard(
  card: ScryfallCard,
): Prisma.PoolCardCreateManyDraftInput {
  const faces = card.card_faces ?? [];
  const oracleId = oracleIdOf(card);
  if (!oracleId) throw new NoOracleIdError(card.name);
  const manaValue = ofCardOrFrontFace(card, 'cmc');
  if (manaValue === undefined) {
    throw new MissingCardFieldError(card.name, 'mana value');
  }
  const typeLine = ofCardOrFrontFace(card, 'type_line');
  if (typeLine === undefined) {
    throw new MissingCardFieldError(card.name, 'type line');
  }
  const images: StoredCardImages[] = (
    card.image_uris ? [card.image_uris] : faces.map((face) => face.image_uris)
  )
    .filter((uris): uris is CardImages => !!uris)
    .map(({ small, normal, large }) => ({ small, normal, large }));
  return {
    scryfallId: card.id,
    oracleId,
    name: card.name,
    set: card.set,
    collectorNumber: card.collector_number,
    typeLine,
    colors: card.colors ?? [
      ...new Set(faces.flatMap((face) => face.colors ?? [])),
    ],
    manaValue,
    ...searchFields(card),
    images,
  };
}

/** The fields the pool search needs. */
function searchFields(card: ScryfallCard) {
  return {
    manaCost: card.mana_cost ?? null,
    oracleText: card.oracle_text ?? null,
    colorIdentity: card.color_identity,
    keywords: card.keywords,
    rarity: card.rarity,
    layout: card.layout,
    power: card.power ?? null,
    toughness: card.toughness ?? null,
    loyalty: card.loyalty ?? null,
    defense: card.defense ?? null,
    faces: (card.card_faces ?? []).map(toCardFace),
  };
}

function toCardFace(face: ScryfallCardFace): StoredCardFace {
  return {
    name: face.name,
    typeLine: face.type_line ?? null,
    oracleText: face.oracle_text ?? null,
    manaCost: face.mana_cost ?? null,
    colors: face.colors ?? null,
    power: face.power ?? null,
    toughness: face.toughness ?? null,
    loyalty: face.loyalty ?? null,
    defense: face.defense ?? null,
  };
}
