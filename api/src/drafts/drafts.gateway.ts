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

/**
 * Pushes each draft's changes to everyone watching it, over Socket.IO. A
 * signed-in client connects once, then asks to watch each draft it shows
 * (`DraftSocketRequests`). Watches don't outlast the connection, so on
 * every reconnect it watches them again; it should then re-read them, as it
 * may have missed changes meanwhile. Each socket is also in its viewer's own
 * room, which is pushed every draft they play in without asking.
 */
@WebSocketGateway({ path: `/${API_PREFIX}/socket.io` })
export class DraftsGateway implements OnGatewayInit, OnGatewayConnection {
  @WebSocketServer()
  private readonly server!: Server<DraftSocketRequests, DraftSocketEvents>;

  constructor(
    private readonly sessions: SessionService,
    private readonly appAdmins: AppAdminConfig,
    private readonly access: DraftAccess,
  ) {}

  /** Refuses sockets without a live session, as SessionGuard does requests. */
  afterInit(server: Server): void {
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

  /** The socket's signed-in user, noted on the socket, if it has one. */
  private async admit(
    socket: DraftServerSocket,
    token: string | undefined,
  ): Promise<User | null> {
    const user = token ? await this.sessions.findUser(token) : null;
    if (user) socket.data = { user, pendingWatches: new Map() };
    return user;
  }

  /**
   * Joins the socket to its viewer's own room. Nothing is awaited between
   * admitting it and joining, so it can miss no push meanwhile.
   */
  handleConnection(socket: DraftServerSocket): void {
    void socket.join(ownRoom(socket.data.user.id));
  }

  /**
   * Joins the socket to the room of the draft it names, if its viewer may
   * see it. A refused watch joins nothing: the client's reads of the draft
   * already 404. Nor does one the client stopped, or dropped the connection,
   * while it was being checked.
   */
  @SubscribeMessage('watch')
  async watch(
    @ConnectedSocket() socket: DraftServerSocket,
    @MessageBody() draftId: unknown,
  ): Promise<DraftWatchResult> {
    if (typeof draftId !== 'string') return 'refused';
    const { pendingWatches } = socket.data;
    const request = Symbol(draftId);
    pendingWatches.set(draftId, request);
    const seesDraft = await this.canSee(socket.data.user, draftId);
    const stillWanted = pendingWatches.get(draftId) === request;
    if (stillWanted) pendingWatches.delete(draftId);
    if (!stillWanted || !socket.connected || !seesDraft) return 'refused';
    await socket.join(room(draftId));
    return 'watching';
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
   * Tells everyone watching the draft, and each of its players but the bots,
   * how it now is: once each, even a player also watching it.
   */
  changed(draft: DraftView): void {
    const players = draft.players.filter((player) => !player.isBot);
    this.server
      .to([room(draft.id), ...players.map((player) => ownRoom(player.id))])
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
