// Records the app version for the running API to read: the commit Heroku is
// deploying, which it sets as SOURCE_VERSION during the build only. Without
// it (local builds, CI) the version is recorded as unknown.
//
// Usage: node scripts/record-app-version.mjs <output file>
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const [file] = process.argv.slice(2);
if (!file) {
  console.error('Usage: node scripts/record-app-version.mjs <output file>');
  process.exit(1);
}

const commit = process.env.SOURCE_VERSION?.trim() || null;
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, `${JSON.stringify({ commit })}\n`);
console.log(`Recorded app version: ${commit ?? 'unknown'}`);
