/**
 * Checks the web stylesheets against the shared page frame (#655), as part of
 * `npm run lint`:
 *
 * - A width in an `@media` or `@container` query is written only in the
 *   breakpoint partial, `src/_breakpoints.scss`; everywhere else uses its
 *   variables.
 * - A `max-width` or `max-inline-size` is never a literal `rem` or `px`: a page
 *   takes its width from the page frame, and a cap uses a width token
 *   (`var(--width-…)`). Component sizes go in the allowlist below.
 *
 * Run from web/: node scripts/check-stylesheets.mts
 * Exits non-zero, listing each problem, if any stylesheet breaks a rule.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const sourceDir = join(root, 'src');
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

const length = /\d*\.?\d+(px|rem|em)\b/;
const query = /@(media|container)\b([^{]*)/g;
/** A declaration, not a media feature such as `(max-width: 36rem)`. */
const cap = /(?<=^|[;{])\s*(max-width|max-inline-size)\s*:\s*([^;{}]+)/gm;

function stylesheets(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return stylesheets(path);
    return entry.name.endsWith('.scss') ? [path] : [];
  });
}

/** Blanks out comments, keeping line breaks so line numbers still match. */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (comment, before: string) =>
      before.padEnd(comment.length, ' '),
    );
}

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

const problems: string[] = [];
for (const path of stylesheets(sourceDir)) {
  const file = relative(root, path);
  const source = withoutComments(readFileSync(path, 'utf8'));

  if (file !== breakpointPartial) {
    for (const match of source.matchAll(query)) {
      if (length.test(match[2])) {
        problems.push(
          `${file}:${lineOf(source, match.index)}: @${match[1]} width "${match[2].trim()}": use a variable from ${breakpointPartial}`,
        );
      }
    }
  }

  for (const match of source.matchAll(cap)) {
    const value = match[2].trim();
    if (length.test(value) && !value.includes('var(') && !allowedCaps.has(`${file}: ${value}`)) {
      problems.push(
        `${file}:${lineOf(source, match.index + match[0].indexOf(match[1]))}: ${match[1]}: ${value}: use the page frame or a width token (var(--width-…)), or allowlist a component size in scripts/check-stylesheets.mts`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  console.error(`\n${problems.length} stylesheet problem(s).`);
  process.exit(1);
}
