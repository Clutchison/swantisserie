import { CdkDrag, CdkDragHandle, CdkDropList } from '@angular/cdk/drag-drop';
import { DebugElement, getDebugNode, type Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { AppFixture } from './harness';

/**
 * Starts dragging the card that holds `element`, as the CDK says a drag has
 * started (jsdom can't drag), and renders what came of it.
 */
export function startDrag(fixture: AppFixture, element: HTMLElement) {
  dragHolding(fixture, element).triggerEventHandler('cdkDragStarted', {});
  TestBed.tick();
}

/**
 * Whether the card that holds `element` can be dragged, as the CDK says
 * (jsdom can't drag): false where a swipe on it must always scroll.
 */
export const draggable = (fixture: AppFixture, element: HTMLElement) =>
  !dragHolding(fixture, element).injector.get(CdkDrag).disabled;

/**
 * The drag handle of the card that holds `element`, if it has one: hidden
 * from assistive tech, which reorders with buttons or a menu instead.
 */
export const dragHandle = (fixture: AppFixture, element: HTMLElement): HTMLElement | undefined =>
  dragHolding(fixture, element).query(By.directive(CdkDragHandle))?.nativeElement;

/**
 * Presses a finger on `element`, holds it there for `heldFor` ms, then
 * slides it down a row's height and lifts it, as the CDK hears touch
 * events; answers whether that started a drag of the card holding it.
 */
export function touchDrag(fixture: AppFixture, element: HTMLElement, heldFor: number) {
  const drag = dragHolding(fixture, element).injector.get(CdkDrag);
  let started = false;
  const watching = drag.started.subscribe(() => (started = true));
  const touch = (type: string, target: EventTarget, pageY: number) => {
    const at = [{ identifier: 1, pageX: 10, pageY, target }];
    const event = new Event(type, { bubbles: true, cancelable: true });
    // A lifted finger is no longer touching, only changed.
    const touching = type === 'touchend' ? [] : at;
    Object.defineProperties(event, {
      touches: { value: touching },
      targetTouches: { value: touching },
      changedTouches: { value: at },
    });
    target.dispatchEvent(event);
  };
  const now = Date.now();
  const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
  try {
    touch('touchstart', element, 10);
    clock.mockReturnValue(now + heldFor);
    touch('touchmove', document, 40);
    touch('touchend', document, 40);
  } finally {
    clock.mockRestore();
    watching.unsubscribe();
  }
  TestBed.tick();
  return started;
}

/**
 * Drops the card that holds `element` at `currentIndex` in its list, as the
 * CDK says a drop ended (jsdom can't drag), and renders what came of it. Like
 * the CDK, the drop says the card's index from when the drag started.
 */
export function dropAt(fixture: AppFixture, element: HTMLElement, currentIndex: number) {
  const list = holding(fixture, CdkDropList, element);
  const drags = list.queryAll(By.directive(CdkDrag));
  const previousIndex = drags.findIndex((drag) => drag.nativeElement.contains(element));
  const container = list.injector.get(CdkDropList);
  list.triggerEventHandler('cdkDropListDropped', {
    item: drags[previousIndex].injector.get(CdkDrag),
    previousIndex,
    currentIndex,
    container,
    previousContainer: container,
  });
  TestBed.tick();
}

/**
 * Where drag and drop can be: the page, and each dialog open over it, such
 * as the Queue sheet, which the CDK puts outside the page.
 */
const dragRoots = (fixture: AppFixture) => [
  fixture.debugElement,
  ...[...document.querySelectorAll('[role="dialog"]')]
    .map((dialog) => getDebugNode(dialog))
    .filter((node) => node instanceof DebugElement),
];

/** The element with the drag-and-drop directive `directive` that holds `element`. */
const holding = (fixture: AppFixture, directive: Type<unknown>, element: HTMLElement) =>
  dragRoots(fixture)
    .flatMap((root) => root.queryAll(By.directive(directive)))
    .find((found) => found.nativeElement.contains(element))!;

/** The draggable card that holds `element`. */
const dragHolding = (fixture: AppFixture, element: HTMLElement) =>
  holding(fixture, CdkDrag, element);
