import type { DraftView } from 'contract';
import type { Subscription } from 'rxjs';
import { vi } from 'vitest';
import type { DraftUpdate, DraftUpdates } from './draft-updates';
import { draft } from './specs/harness';

/** Stands in for Socket.IO's client: `io` answers the socket a test drives. */
const io = vi.fn();

/** A socket as Socket.IO's client gives one: the API pushes through `push`. */
class FakeSocket {
  /** Whether Socket.IO is still trying to connect, and will retry on its own. */
  active = true;
  readonly connect = vi.fn();
  readonly disconnect = vi.fn();
  private readonly listeners = new Map<string, (...args: unknown[]) => void>();

  on(event: string, listener: (...args: unknown[]) => void) {
    this.listeners.set(event, listener);
    return this;
  }

  /** The socket fires `event`, as Socket.IO does on the API's push or a change of connection. */
  push(event: string, ...args: unknown[]) {
    this.listeners.get(event)?.(...args);
  }

  /** The API refuses the handshake with `message`, after which Socket.IO gives up unless `active`. */
  refuse(message: string, { active }: { active: boolean }) {
    this.active = active;
    this.push('connect_error', new Error(message));
  }
}

/** How long the updates wait before retrying a handshake the API refused for its own reasons. */
const RETRY_MS = 5000;

describe('draft updates', () => {
  let updates: DraftUpdates;
  let socket: FakeSocket;
  let received: DraftUpdate[];
  let watching: Subscription;

  // Spec files share their modules, so another's may already have loaded
  // the updates with the real Socket.IO client: load them afresh with the
  // stand-in, and leave the next spec file the real client.
  beforeAll(async () => {
    vi.doMock('socket.io-client', () => ({ io }));
    vi.resetModules();
    const { DraftUpdates } = await import('./draft-updates');
    updates = new DraftUpdates();
  });

  afterAll(() => {
    vi.doUnmock('socket.io-client');
    vi.resetModules();
  });

  beforeEach(() => {
    vi.useFakeTimers();
    socket = new FakeSocket();
    io.mockReset().mockReturnValue(socket);
    received = [];
    watching = updates.watch('draft-1').subscribe((update) => received.push(update));
  });

  afterEach(() => {
    watching.unsubscribe();
    vi.useRealTimers();
  });

  it('connects to the API’s Socket.IO gateway for the draft watched', () => {
    expect(io).toHaveBeenCalledExactlyOnceWith({
      path: '/api/socket.io',
      auth: { draftId: 'draft-1' },
    });
  });

  it('says when the socket connects, drops, and what the API pushes', () => {
    const changed: DraftView = draft({ name: 'Pushed' });

    socket.push('connect');
    socket.push('changed', changed);
    socket.push('disconnect');
    socket.push('cancelled');

    expect(received).toEqual([
      { type: 'connected' },
      { type: 'changed', draft: changed },
      { type: 'disconnected' },
      { type: 'cancelled' },
    ]);
  });

  describe('when the API refuses the handshake', () => {
    it('says it is disconnected and leaves Socket.IO to retry, while it still does', () => {
      socket.refuse('lookup failed', { active: true });
      vi.advanceTimersByTime(RETRY_MS);

      expect(received).toEqual([{ type: 'disconnected' }]);
      expect(socket.connect).not.toHaveBeenCalled();
    });

    it('says nothing for an ended session while Socket.IO still retries', () => {
      socket.refuse('unauthorized', { active: true });

      expect(received).toEqual([]);
    });

    it('says it is disconnected and retries once Socket.IO gives up', () => {
      socket.refuse('lookup failed', { active: false });
      expect(received).toEqual([{ type: 'disconnected' }]);

      vi.advanceTimersByTime(RETRY_MS - 1);
      expect(socket.connect).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(socket.connect).toHaveBeenCalledOnce();
    });

    it('says the session has ended, and stops, once Socket.IO gives up', () => {
      socket.refuse('unauthorized', { active: false });
      vi.advanceTimersByTime(RETRY_MS);

      expect(received).toEqual([{ type: 'unauthorized' }]);
      expect(socket.connect).not.toHaveBeenCalled();
    });
  });

  describe('when no longer watched', () => {
    it('disconnects the socket', () => {
      watching.unsubscribe();

      expect(socket.disconnect).toHaveBeenCalledOnce();
    });

    it('cancels a pending retry', () => {
      socket.refuse('lookup failed', { active: false });

      watching.unsubscribe();
      vi.advanceTimersByTime(RETRY_MS);

      expect(socket.connect).not.toHaveBeenCalled();
    });
  });
});
