/**
 * The CDN URL of a Discord user's avatar.
 * https://docs.discord.com/developers/reference#image-formatting
 */
export function avatarUrl({
  id,
  avatar,
}: {
  id: string;
  avatar: string | null;
}): string {
  if (avatar) return `https://cdn.discordapp.com/avatars/${id}/${avatar}.png`;
  // Default avatar for users on the new (discriminator-less) username system.
  const index = (BigInt(id) >> 22n) % 6n;
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}
