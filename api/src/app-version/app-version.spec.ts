import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppVersion } from './app-version.js';

const RECORD_SCRIPT = join(
  import.meta.dirname,
  '../../scripts/record-app-version.mjs',
);

describe('recording the app version at build time', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'app-version-'));
    file = join(dir, 'dist', 'app-version.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /** Runs the build's record step as Heroku would, with `sourceVersion` as SOURCE_VERSION. */
  function record(sourceVersion: string | undefined) {
    const env = { ...process.env };
    delete env.SOURCE_VERSION;
    if (sourceVersion !== undefined) env.SOURCE_VERSION = sourceVersion;
    execFileSync(process.execPath, [RECORD_SCRIPT, file], { env });
  }

  it('keeps the commit Heroku is deploying', () => {
    record('0123456789abcdef0123456789abcdef01234567');

    expect(AppVersion.read(file).commit).toBe(
      '0123456789abcdef0123456789abcdef01234567',
    );
  });

  it('records an unknown version when SOURCE_VERSION is missing', () => {
    record(undefined);

    expect(AppVersion.read(file).commit).toBeNull();
  });

  it('records an unknown version when SOURCE_VERSION is blank', () => {
    record('  ');

    expect(AppVersion.read(file).commit).toBeNull();
  });

  it('reads as unknown when nothing was recorded, as in local dev', () => {
    expect(AppVersion.read(file).commit).toBeNull();
  });
});
