/**
 * Fixture tests for the stylesheet check. Run from web/, as `npm run lint` does:
 * node --test scripts/check-stylesheets.test.mts
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkStylesheets } from './check-stylesheets.mts';

const partial = 'src/_breakpoints.scss';
const check = (files: Record<string, string>, allowed: string[] = []) =>
  checkStylesheets(
    Object.entries(files).map(([file, source]) => ({ file, source })),
    new Set(allowed),
  );

test('a query width from the partial passes', () => {
  assert.deepEqual(
    check({
      [partial]: '$desktop: 1024px;\n$tab-narrow: 26rem;',
      'src/app/page.scss':
        "@use '../breakpoints' as bp;\n@media (min-width: bp.$desktop) { a { color: red; } }\n@container (width < #{bp.$tab-narrow}) { a { color: red; } }",
    }),
    [],
  );
});

test('a literal query width fails, past an interpolation in the same query', () => {
  const problems = check({
    'src/app/page.scss':
      '@media (min-width: #{$x}) and (max-width: 30rem) {\n  a { color: red; }\n}\n\n@container (width < 26rem) { b { color: red; } }',
  });
  assert.equal(problems.length, 2);
  assert.match(problems[0], /^src\/app\/page\.scss:1: @media .*30rem/);
  assert.match(problems[1], /^src\/app\/page\.scss:5: @container .*26rem/);
});

test('a literal query width in the partial passes', () => {
  assert.deepEqual(check({ [partial]: '@media (min-width: 1024px) { a { color: red; } }' }), []);
});

test('widths in comments pass', () => {
  assert.deepEqual(
    check({
      'src/app/page.scss':
        '/* @media (min-width: 1024px) and max-width: 40rem; */\n// @container (width < 26rem)\na {\n  // max-width: 40rem;\n  color: red;\n}',
    }),
    [],
  );
});

test('a literal cap in a page stylesheet fails, on its own line', () => {
  const problems = check({
    'src/app/my-page.scss': 'main {\n  color: red;\n  max-width: 40rem;\n}',
  });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /^src\/app\/my-page\.scss:3: max-width: 40rem/);
});

test('a cap from a width token, and a media feature, pass', () => {
  assert.deepEqual(
    check({
      [partial]: '$narrow: 36rem;',
      'src/app/my-page.scss':
        "@use '../breakpoints' as bp;\nform { max-inline-size: var(--width-narrow); }\n@media (max-width: bp.$narrow) { a { color: red; } }",
    }),
    [],
  );
});

test('custom properties are not scanned, so a dialog width passes', () => {
  assert.deepEqual(check({ 'src/app/my-dialog.scss': ':host { --dialog-width: 48rem; }' }), []);
});

test('an allowlisted component size passes', () => {
  assert.deepEqual(
    check({ 'src/app/stack.scss': '.stack { max-width: 10rem; }' }, ['src/app/stack.scss: 10rem']),
    [],
  );
});

test('an allowlist entry that matches nothing is reported', () => {
  const problems = check({ 'src/app/stack.scss': '.stack { max-width: 10rem; }' }, [
    'src/app/stack.scss: 10rem',
    'src/app/gone.scss: 6rem',
  ]);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /src\/app\/gone\.scss: 6rem.*matches nothing/);
});
