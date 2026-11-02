/**
 * One `<count> <line>` per distinct line, so copies of a card share a line,
 * in the order each line first appears.
 */
export function countedLines(lines: string[]): string[] {
  const counts = new Map<string, number>();
  for (const line of lines) counts.set(line, (counts.get(line) ?? 0) + 1);
  return [...counts].map(([line, count]) => `${count} ${line}`);
}
