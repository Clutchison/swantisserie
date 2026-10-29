/** App admins: Discord user IDs with organizer powers on every draft. */
export class AdminConfig {
  private readonly ids: ReadonlySet<string>;

  /** `adminIds` is ADMIN_DISCORD_IDS: comma-separated, blanks ignored. */
  constructor(adminIds: string | undefined) {
    this.ids = new Set(
      (adminIds ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    );
  }

  isAdmin(userId: string): boolean {
    return this.ids.has(userId);
  }
}
