/**
 * A uniformly random reordering of `items`, as a new array. `random` returns
 * numbers in [0, 1), like Math.random.
 */
export function shuffle<T>(
  items: readonly T[],
  random: () => number = Math.random,
): T[] {
  const shuffled = [...items];
  // Stryker disable next-line EqualityOperator: `i >= 0` adds a step that swaps an element with itself and draws one extra number, which no caller reuses.
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * A random number generator for `shuffle` that returns the same sequence of
 * numbers in [0, 1) for the same `seed`, so a seeded shuffle can be pinned
 * by a spec (mulberry32).
 */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
