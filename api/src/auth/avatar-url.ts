import type { User } from '../generated/prisma/client.js';

/**
 * The CDN URL of a Discord user's avatar; bots get a default one.
 * https://docs.discord.com/developers/reference#image-formatting
 */
export function avatarUrl({
  id,
  avatar,
  isBot,
}: Pick<User, 'id' | 'avatar' | 'isBot'>): string {
  // A bot's id isn't a snowflake, so can't pick a default avatar.
  if (isBot) return 'https://cdn.discordapp.com/embed/avatars/0.png';
  if (avatar) return `https://cdn.discordapp.com/avatars/${id}/${avatar}.png`;
  // Default avatar for users on the new (discriminator-less) username system.
  const index = (BigInt(id) >> 22n) % 6n;
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}
