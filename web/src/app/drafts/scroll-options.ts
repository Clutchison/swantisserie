/**
 * How to scroll an element into view, `container` included: 'nearest'
 * scrolls only its nearest scroller. `container` is newer than TypeScript's
 * DOM types; a browser without it scrolls every scroller around the element,
 * the page too, as its `block` and `inline` say.
 */
export type ScrollIntoContainerOptions = ScrollIntoViewOptions & {
  container?: 'all' | 'nearest';
};
