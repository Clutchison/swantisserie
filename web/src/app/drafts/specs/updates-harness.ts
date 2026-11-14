import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { vi } from 'vitest';
import { type DraftUpdate, DraftUpdates, type OwnDraftUpdate } from '../draft-updates';

/**
 * Stands in for the API's Socket.IO gateway: push a watched draft's events
 * through `events`, and the viewer's own drafts' through `ownEvents`.
 */
export interface FakeDraftUpdates {
  events: Subject<DraftUpdate>;
  watch: ReturnType<typeof vi.fn>;
  ownEvents: Subject<OwnDraftUpdate>;
  own: () => Subject<OwnDraftUpdate>;
}

/** A fresh stand-in for the gateway, and the provider that puts it in place of `DraftUpdates`. */
export function fakeDraftUpdates() {
  const events = new Subject<DraftUpdate>();
  const ownEvents = new Subject<OwnDraftUpdate>();
  const updates: FakeDraftUpdates = {
    events,
    watch: vi.fn(() => events),
    ownEvents,
    own: () => ownEvents,
  };
  return { updates, provider: { provide: DraftUpdates, useValue: updates } };
}

/** The API pushes `update` to the viewer's own room through `updates`, and the app renders it. */
export function pushToOwnRoom(updates: FakeDraftUpdates, update: OwnDraftUpdate) {
  updates.ownEvents.next(update);
  TestBed.tick();
}
