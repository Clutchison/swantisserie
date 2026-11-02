import { readFileSync } from 'node:fs';

/** Which commit of the app is running, as recorded when the API was built. */
export class AppVersion {
  constructor(
    /** The full commit SHA, or null when the build did not record one. */
    readonly commit: string | null,
  ) {}

  /** Reads what the build recorded; a missing or unreadable record means unknown. */
  static read(file: string): AppVersion {
    let recorded: unknown;
    try {
      recorded = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      return new AppVersion(null);
    }
    const commit = (recorded as { commit?: unknown } | null)?.commit;
    return new AppVersion(typeof commit === 'string' && commit ? commit : null);
  }
}
