import {
  ConnectedSocket,
  MessageBody,
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
}

type DraftSocket = Socket<
  DraftSocketRequests,
  DraftSocketEvents,
  never,
  SocketData
>;

/** The room of everyone watching one draft. */
const room = (draftId: string) => `draft:${draftId}`;

/**
 * Pushes each draft's changes to everyone watching it, over Socket.IO. A
 * signed-in client connects once, then asks to watch each draft it shows
 * (`DraftSocketRequests`). Watches don't outlast the connection, so on
 * every reconnect it watches them again; it should then re-read them, as it
 * may have missed changes meanwhile.
 */
@WebSocketGateway({ path: `/${API_PREFIX}/socket.io` })
export class DraftsGateway implements OnGatewayInit {
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
        this.admit(socket as DraftSocket, sessionToken(req)).then(
          (user) => next(user ? undefined : new Error('unauthorized')),
          next,
        );
      });
    });
  }

  /** The socket's signed-in user, noted on the socket, if it has one. */
  private async admit(
    socket: DraftSocket,
    token: string | undefined,
  ): Promise<User | null> {
    const user = token ? await this.sessions.findUser(token) : null;
    if (user) socket.data.user = user;
    return user;
  }

  /**
   * Joins the socket to the room of the draft it names, if its viewer may
   * see it. A refused watch joins nothing: the client's reads of the draft
   * already 404.
   */
  @SubscribeMessage('watch')
  async watch(
    @ConnectedSocket() socket: DraftSocket,
    @MessageBody() draftId: unknown,
  ): Promise<DraftWatchResult> {
    if (typeof draftId !== 'string') return 'refused';
    try {
      await this.access.canSee(
        toSessionUser(socket.data.user, this.appAdmins),
        draftId,
      );
    } catch (err) {
      if (err instanceof CannotSeeDraftError) return 'refused';
      throw err;
    }
    await socket.join(room(draftId));
    return 'watching';
  }

  /** Takes the socket out of the room of the draft it names. */
  @SubscribeMessage('stopWatching')
  async stopWatching(
    @ConnectedSocket() socket: DraftSocket,
    @MessageBody() draftId: unknown,
  ): Promise<'stopped'> {
    if (typeof draftId === 'string') await socket.leave(room(draftId));
    return 'stopped';
  }

  /** Tells everyone watching the draft how it now is. */
  changed(draft: DraftView): void {
    this.server.to(room(draft.id)).emit('changed', draft);
  }

  /** Tells everyone watching the draft that it no longer exists. */
  cancelled(draftId: string): void {
    this.server.to(room(draftId)).emit('cancelled', draftId);
  }
}
