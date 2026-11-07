/** What a set is found by: its code and its name. */
interface Searchable {
  readonly code: string;
  readonly name: string;
}

/**
 * The sets whose code or name holds `search`, ignoring case and the spaces
 * around it, in the order given: how both the set list picker and the
 * Printing picker find a set.
 */
export function setsMatching<S extends Searchable>(sets: readonly S[], search: string): S[] {
  const wanted = search.trim().toLowerCase();
  return sets.filter(
    (set) => set.code.toLowerCase().includes(wanted) || set.name.toLowerCase().includes(wanted),
  );
}
