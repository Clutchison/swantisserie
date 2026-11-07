import type { PoolCardView } from 'contract';

/**
 * Whether one of a card's images is of a horizontal card's face, printed to be
 * read sideways: the one image of a split card or Room, or a battle's front.
 * An Aftermath card is read upright, though half of it is printed sideways,
 * and a Kamigawa flip card turns upside down, not sideways.
 */
export function isHorizontal(
  card: Pick<PoolCardView, 'layout' | 'keywords' | 'typeLine' | 'faces'>,
  imageIndex: number,
): boolean {
  if (card.layout === 'split') return !card.keywords.includes('Aftermath');
  const frontTypeLine = card.faces[0]?.typeLine ?? card.typeLine;
  const [types] = frontTypeLine.split(' — ');
  return imageIndex === 0 && types.split(' ').includes('Battle');
}
