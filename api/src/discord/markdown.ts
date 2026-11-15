/**
 * `text` in bold on one line, a space for each line break, with any
 * markdown or mention in it shown as written.
 */
export function bold(text: string): string {
  const line = text.replace(/\r\n|\r|\n/g, ' ');
  return `**${line.replace(/[\\*_~|`<>[\]]/g, '\\$&')}**`;
}

/** A ping of the Discord user `id`, as webhook post content writes it. */
export function mention(id: string): string {
  return `<@${id}>`;
}
