/** Between the faces of a multi-face card's name, as Scryfall writes it. */
export const FACE_SEPARATOR = ' // ';

/** The name of a multi-face card's front face, or a single-faced card's whole name. */
export function frontFace(name: string): string {
  return name.split(FACE_SEPARATOR)[0];
}
