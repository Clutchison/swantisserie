/**
 * Checks the web stylesheets against the shared page frame (#655), as part of
 * `npm run lint`:
 *
 * - A width in an `@media` or `@container` query is written only in the
 *   breakpoint partial, `src/_breakpoints.scss`; everywhere else uses its
 *   variables.
 * - A `max-width` or `max-inline-size` is never a literal `rem` or `px`: a page
 *   takes its width from the page frame, and a cap uses a width token
 *   (`var(--width-…)`). Component sizes go in the allowlist below, and an
 *   entry that no longer matches anything is reported, so the list stays short.
 *
 * Custom properties aren't scanned, so a component size set through one, such
 * as a dialog's `--dialog-width`, passes without an allowlist entry.
 *
 * Run from web/: node scripts/check-stylesheets.mts
 * Exits non-zero, listing each problem, if any stylesheet breaks a rule.
 * Tests: node --test scripts/check-stylesheets.test.mts
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const breakpointPartial = 'src/_breakpoints.scss';

/**
 * Literal caps that are a component's own size, not a page's or tab's width:
 * `<file>: <value>`, each with why.
 */
const allowedCaps = new Set([
  // A card stack's column: the card's own width.
  'src/app/drafts/plan-stacks.scss: 10rem',
  // The New draft form's number inputs: a few digits wide.
  'src/app/drafts/create-draft-page.scss: 6rem',
  // The Pool tab's search field, capped so a long search still fits on a laptop.
  'src/app/drafts/pool-tab.scss: 50rem',
]);

export interface Stylesheet {
  /** Relative to web/, as `src/app/page.scss`. */
  file: string;
  source: string;
}

const length = /\d*\.?\d+(px|rem|em)\b/;
const queryStart = /@(media|container)\b/g;
/** A declaration, not a media feature such as `(max-width: 36rem)`. */
const cap = /(?<=^|[;{])\s*(max-width|max-inline-size)\s*:\s*([^;{}]+)/gm;

/** Blanks out comments, keeping line breaks so line numbers still match. */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (comment, before: string) =>
      before.padEnd(comment.length, ' '),
    );
}

/**
 * The query's text from `from` to the `{` that opens its block, with each
 * Sass interpolation `#{…}` left out: those are variables, not literals.
 */
function queryText(source: string, from: number): string {
  let text = '';
  for (let i = from; i < source.length; i++) {
    const char = source[i];
    if (char === '#' && source[i + 1] === '{') {
      let depth = 0;
      for (i++; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}' && --depth === 0) break;
      }
      text += ' ';
      continue;
    }
    if (char === '{' || char === ';') break;
    text += char;
  }
  return text;
}

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

/** Every problem in `stylesheets`, including allowlist entries that match nothing. */
export function checkStylesheets(stylesheets: Stylesheet[], allowed: Set<string>): string[] {
  const problems: string[] = [];
  const used = new Set<string>();

  for (const { file, source: raw } of stylesheets) {
    const source = withoutComments(raw);

    if (file !== breakpointPartial) {
      for (const match of source.matchAll(queryStart)) {
        const query = queryText(source, match.index + match[0].length);
        if (length.test(query)) {
          problems.push(
            `${file}:${lineOf(source, match.index)}: @${match[1]} width "${query.trim().replace(/\s+/g, ' ')}": use a variable from ${breakpointPartial}`,
          );
        }
      }
    }

    for (const match of source.matchAll(cap)) {
      const value = match[2].trim();
      if (!length.test(value) || value.includes('var(')) continue;
      const entry = `${file}: ${value}`;
      if (allowed.has(entry)) {
        used.add(entry);
        continue;
      }
      problems.push(
        `${file}:${lineOf(source, match.index + match[0].indexOf(match[1]))}: ${match[1]}: ${value}: use the page frame or a width token (var(--width-…)), or allowlist a component size in scripts/check-stylesheets.mts`,
      );
    }
  }

  for (const entry of allowed) {
    if (!used.has(entry)) {
      problems.push(
        `allowlist entry "${entry}" matches nothing: remove it from scripts/check-stylesheets.mts`,
      );
    }
  }
  return problems;
}

function stylesheetsIn(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return stylesheetsIn(path);
    return entry.name.endsWith('.scss') ? [path] : [];
  });
}

if (import.meta.main) {
  const root = resolve(import.meta.dirname, '..');
  const problems = checkStylesheets(
    stylesheetsIn(join(root, 'src')).map((path) => ({
      file: relative(root, path),
      source: readFileSync(path, 'utf8'),
    })),
    allowedCaps,
  );
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    console.error(`\n${problems.length} stylesheet problem(s).`);
    process.exit(1);
  }
}
