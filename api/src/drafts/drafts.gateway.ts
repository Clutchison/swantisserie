import { Logger, type OnModuleDestroy } from '@nestjs/common';
import {
  Ack,
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type {
  DraftSocketEvents,
  DraftSocketRequests,
  DraftView,
  DraftWatchResult,
} from 'contract';
import cookieParser from 'cookie-parser';
import type { Request, Response } from 'express';
import type { Subscription } from 'rxjs';
import type { Server, Socket } from 'socket.io';
import { API_PREFIX } from '../app.setup.js';
import { sessionToken, toSessionUser } from '../auth/session.guard.js';
import { SessionService } from '../auth/session.service.js';
import { AppAdminConfig } from '../auth/app-admin-config.js';
import type { User } from '../generated/prisma/client.js';
import { DraftAccess } from './draft-access.js';
import { CannotSeeDraftError } from './draft-errors.js';

const parseCookies = cookieParser();

/** What the gateway keeps on each socket. */
interface SocketData {
  /** The socket's signed-in user, found when it was admitted. */
  user: User;
  /** The id of the session that admitted the socket. */
  sessionId: string;
  /** When that session expires, as it stood when the socket was admitted. */
  sessionExpiresAt: Date;
  /**
   * Each draft the socket asked to watch and hasn't yet joined, by a token
   * of that request. A stop removes it and a newer watch replaces it, so
   * the request no longer joins once its check is done.
   */
  pendingWatches: Map<string, symbol>;
}

type DraftServerSocket = Socket<
  DraftSocketRequests,
  DraftSocketEvents,
  never,
  SocketData
>;

/** The room of everyone watching one draft. */
const room = (draftId: string) => `draft:${draftId}`;

/** The room of every socket of one signed-in user, their own room. */
const ownRoom = (userId: string) => `user:${userId}`;

/** The room of every socket one session admitted, closed when it ends. */
const sessionRoom = (sessionId: string) => `session:${sessionId}`;

/** How a watch's check came out, before it is answered. */
type WatchCheck = 'ended' | 'unchecked' | 'sees' | 'cannotSee';

/** The longest a Node timer waits, about 24.8 days; a longer wait is 1 ms. */
export const LONGEST_TIMER_MS = 2 ** 31 - 1;

/**
 * Pushes each draft's changes to everyone watching it, over Socket.IO. A
 * signed-in client connects once, then asks to watch each draft it shows
 * (`DraftSocketRequests`). Watches don't outlast the connection, so on
 * every reconnect it watches them again; it should then re-read them, as it
 * may have missed changes meanwhile. Each socket is also in its viewer's own
 * room, which is pushed every draft they play in without asking. A socket
 * lives no longer than the session that admitted it: when the session ends,
 * the gateway closes it.
 */
@WebSocketGateway({ path: `/${API_PREFIX}/socket.io` })
export class DraftsGateway
  implements OnGatewayInit, OnGatewayConnection, OnModuleDestroy
{
  @WebSocketServer()
  private readonly server!: Server<DraftSocketRequests, DraftSocketEvents>;
  private readonly logger = new Logger(DraftsGateway.name);

  private endedSessions?: Subscription;

  constructor(
    private readonly sessions: SessionService,
    private readonly appAdmins: AppAdminConfig,
    private readonly access: DraftAccess,
  ) {}

  /**
   * Refuses sockets without a live session, as SessionGuard does requests,
   * and closes each socket of a session once it ends.
   */
  afterInit(server: Server): void {
    this.endedSessions = this.sessions.ended.subscribe((sessionId) =>
      // Closed by the server, so the web connects again and is refused.
      server.in(sessionRoom(sessionId)).disconnectSockets(true),
    );
    server.use((socket, next) => {
      const req = socket.request as Request;
      parseCookies(req, {} as Response, () => {
        this.admit(socket as DraftServerSocket, sessionToken(req)).then(
          (user) => next(user ? undefined : new Error('unauthorized')),
          next,
        );
      });
    });
  }

  onModuleDestroy(): void {
    this.endedSessions?.unsubscribe();
  }

  /**
   * The socket's signed-in user, if it has one, noted on the socket with the
   * session that admitted it.
   */
  private async admit(
    socket: DraftServerSocket,
    token: string | undefined,
  ): Promise<User | null> {
    const session = token ? await this.sessions.find(token) : null;
    if (!session) return null;
    socket.data = {
      user: session.user,
      sessionId: session.id,
      sessionExpiresAt: session.expiresAt,
      pendingWatches: new Map(),
    };
    return session.user;
  }

  /**
   * Joins the socket to its viewer's own room and its session's room.
   * Nothing is awaited between admitting it and joining, so it can miss no
   * push meanwhile. Then closes it if its session ended meanwhile, and once
   * that session expires.
   */
  handleConnection(socket: DraftServerSocket): void {
    void socket.join([
      ownRoom(socket.data.user.id),
      sessionRoom(socket.data.sessionId),
    ]);
    this.closeAtExpiry(socket);
    // A Log out after the handshake read the session, but before the socket
    // joined its room, closed nothing; so the session is read again.
    this.sessions.isLive(socket.data.sessionId).then(
      (live) => {
        if (!live) socket.disconnect(true);
      },
      // Left open: the handshake has just found the session, and the next
      // watch checks it again.
      (err: unknown) =>
        this.logger.error('Checking a new socket’s session failed', err),
    );
  }

  /**
   * Closes the socket once its session expires. A timer can't wait as long
   * as a session lasts, so it waits as long as it can and is set again,
   * until the session has expired. A socket that disconnects first takes its
   * timer with it.
   */
  private closeAtExpiry(socket: DraftServerSocket): void {
    let timer: NodeJS.Timeout | undefined;
    const wait = () => {
      const left = socket.data.sessionExpiresAt.getTime() - Date.now();
      if (left <= 0) socket.disconnect(true);
      else timer = setTimeout(wait, Math.min(left, LONGEST_TIMER_MS));
    };
    socket.on('disconnect', () => clearTimeout(timer));
    wait();
  }

  /**
   * Joins the socket to the room of the draft it names, if its viewer may
   * see it. A refused watch joins nothing: the client's reads of the draft
   * already 404. Nor does one the client stopped, or dropped the connection,
   * while it was being checked, nor one whose check of its session or of
   * the draft failed, which is answered `unchecked` for the client to ask
   * again. A socket whose session has ended is closed instead, and gets no
   * answer.
   */
  @SubscribeMessage('watch')
  watch(
    @ConnectedSocket() socket: DraftServerSocket,
    @MessageBody() draftId: unknown,
  ): Promise<DraftWatchResult | undefined> {
    return typeof draftId === 'string'
      ? this.watchDraft(socket, draftId)
      : this.refuseWatch(socket);
  }

  /** Answers a watch of the draft of id `draftId`, as `watch` does. */
  private async watchDraft(
    socket: DraftServerSocket,
    draftId: string,
  ): Promise<DraftWatchResult | undefined> {
    const { pendingWatches } = socket.data;
    const request = Symbol();
    // Noted before anything is awaited, so a stop sent after it cancels it.
    pendingWatches.set(draftId, request);
    const check = await this.checkWatch(socket.data, draftId);
    const stillWanted = pendingWatches.get(draftId) === request;
    if (stillWanted) pendingWatches.delete(draftId);
    switch (check) {
      case 'ended':
        socket.disconnect(true);
        return undefined;
      case 'unchecked':
        return 'unchecked';
      case 'cannotSee':
        return 'refused';
      case 'sees':
        if (!stillWanted || !socket.connected) return 'refused';
        await socket.join(room(draftId));
        return 'watching';
    }
  }

  /**
   * Refuses a watch of a draft named by anything but its id, closing the
   * socket instead if its session has ended.
   */
  private async refuseWatch(
    socket: DraftServerSocket,
  ): Promise<'refused' | undefined> {
    if ((await this.checkWatch(socket.data)) !== 'ended') return 'refused';
    socket.disconnect(true);
    return undefined;
  }

  /**
   * Whether the socket's session has `ended`, else whether its viewer
   * `sees` the draft of id `draftId` or `cannotSee` it, as they can't one
   * not named; `unchecked` if either check failed.
   */
  private async checkWatch(
    { sessionId, user }: SocketData,
    draftId?: string,
  ): Promise<WatchCheck> {
    try {
      if (!(await this.sessions.isLive(sessionId))) return 'ended';
      if (draftId === undefined) return 'cannotSee';
      return (await this.canSee(user, draftId)) ? 'sees' : 'cannotSee';
    } catch (err) {
      this.logger.error(
        `Checking a watch of draft ${draftId ?? 'not named'} failed`,
        err,
      );
      return 'unchecked';
    }
  }

  /** Whether `user` may see the draft of id `draftId`. */
  private async canSee(user: User, draftId: string): Promise<boolean> {
    try {
      await this.access.canSee(toSessionUser(user, this.appAdmins), draftId);
      return true;
    } catch (err) {
      if (err instanceof CannotSeeDraftError) return false;
      throw err;
    }
  }

  /**
   * Takes the socket out of the room of the draft it names, and stops any
   * watch of it still being checked from joining.
   */
  @SubscribeMessage('stopWatching')
  async stopWatching(
    @ConnectedSocket() socket: DraftServerSocket,
    @MessageBody() draftId: unknown,
    @Ack() ack: () => void,
  ): Promise<void> {
    if (typeof draftId === 'string') {
      socket.data.pendingWatches.delete(draftId);
      await socket.leave(room(draftId));
    }
    ack();
  }

  /**
   * Tells everyone watching the draft, each of its players but the bots, and
   * each of `alsoTellUserIds`, how it now is: once each, even a player also
   * watching it.
   */
  changed(draft: DraftView, alsoTellUserIds: string[]): void {
    const players = draft.players.filter((player) => !player.isBot);
    const userIds = [...players.map((player) => player.id), ...alsoTellUserIds];
    this.server
      .to([room(draft.id), ...userIds.map(ownRoom)])
      .emit('changed', draft);
  }

  /**
   * Tells everyone watching the draft, and each of `playerIds`, its players
   * but the bots, that it no longer exists.
   */
  cancelled(draftId: string, playerIds: string[]): void {
    this.server
      .to([room(draftId), ...playerIds.map(ownRoom)])
      .emit('cancelled', draftId);
  }
}
