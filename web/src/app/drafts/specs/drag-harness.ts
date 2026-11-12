import { CdkDrag, CdkDragHandle } from '@angular/cdk/drag-drop';
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

/** The draggable card that holds `element`. */
const dragHolding = (fixture: AppFixture, element: HTMLElement) =>
  fixture.debugElement
    .queryAll(By.directive(CdkDrag))
    .find((drag) => drag.nativeElement.contains(element))!;
