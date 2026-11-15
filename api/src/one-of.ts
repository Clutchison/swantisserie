/** Whether `value` is one of `list`'s values: the check behind each shared list's guard. */
export function isOneOf<T>(list: readonly T[], value: unknown): value is T {
  return (list as readonly unknown[]).includes(value);
}
