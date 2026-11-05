/** Between the faces of a multi-face card's name, or of its mana cost, as Scryfall writes them. */
export const FACE_SEPARATOR = ' // ';

/** The name of a multi-face card's front face, or a single-faced card's whole name. */
export function frontFace(name: string): string {
  return name.split(FACE_SEPARATOR)[0];
}
