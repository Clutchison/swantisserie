/** `text` in bold, with any markdown or mention in it shown as written. */
export function bold(text: string): string {
  return `**${text.replace(/[\\*_~|`<>[\]]/g, '\\$&')}**`;
}

/** A ping of the Discord user `id`, as webhook post content writes it. */
export function mention(id: string): string {
  return `<@${id}>`;
}
