/** What a set is found by: its code and its name. */
export interface FindableSet {
  readonly code: string;
  readonly name: string;
}

/** What was searched for, as sets are matched against it. */
const normalised = (search: string) => search.trim().toLowerCase();

/**
 * The sets whose code or name holds `search`, ignoring case and the spaces
 * around it, in the order given: how both the set list picker and the
 * Printing picker find a set.
 */
export function setsMatching<S extends FindableSet>(sets: readonly S[], search: string): S[] {
  const wanted = normalised(search);
  return sets.filter(
    (set) => set.code.toLowerCase().includes(wanted) || set.name.toLowerCase().includes(wanted),
  );
}

/** The sets matching `search`, a set whose code is just what was searched for first, the rest in the order given. */
export function setsMatchingCodeFirst<S extends FindableSet>(
  sets: readonly S[],
  search: string,
): S[] {
  const code = normalised(search);
  const isCode = (set: S) => set.code.toLowerCase() === code;
  const matches = setsMatching(sets, search);
  return [...matches.filter(isCode), ...matches.filter((set) => !isCode(set))];
}
