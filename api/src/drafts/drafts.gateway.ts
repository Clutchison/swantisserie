import {
  type OnGatewayConnection,
  type OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { DraftSocketEvents, DraftView } from 'contract';
import cookieParser from 'cookie-parser';
import type { Request, Response } from 'express';
import type { DefaultEventsMap, Server, Socket } from 'socket.io';
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
  /** The draft whose room the socket joins: one its viewer may see. */
  draftId?: string;
}

/** The room of everyone viewing one draft. */
const room = (draftId: string) => `draft:${draftId}`;

/**
 * Pushes each draft's changes to everyone viewing it, over Socket.IO. A
 * client names its draft in the handshake's `auth.draftId`, so it rejoins
 * the room on every reconnect; it should then re-read the draft, as it may
 * have missed changes meanwhile.
 */
@WebSocketGateway({ path: `/${API_PREFIX}/socket.io` })
export class DraftsGateway implements OnGatewayInit, OnGatewayConnection {
  @WebSocketServer()
  private readonly server!: Server<DefaultEventsMap, DraftSocketEvents>;

  constructor(
    private readonly sessions: SessionService,
    private readonly appAdmins: AppAdminConfig,
    private readonly access: DraftAccess,
  ) {}

  /**
   * Refuses sockets without a live session, as SessionGuard does requests,
   * and notes the draft whose room the socket may join: the one it names,
   * if its viewer may see it.
   */
  afterInit(server: Server): void {
    server.use((socket, next) => {
      const req = socket.request as Request;
      parseCookies(req, {} as Response, () => {
        this.admit(socket, sessionToken(req)).then(
          (user) => next(user ? undefined : new Error('unauthorized')),
          next,
        );
      });
    });
  }

  /** Joins the socket to the room of the draft it was admitted to, if any. */
  handleConnection(socket: Socket): void {
    const { draftId } = socket.data as SocketData;
    if (draftId) void socket.join(room(draftId));
  }

  /** The socket's signed-in user, having noted any draft it may watch. */
  private async admit(
    socket: Socket,
    token: string | undefined,
  ): Promise<User | null> {
    const user = token ? await this.sessions.findUser(token) : null;
    if (!user) return null;
    const { draftId } = socket.handshake.auth as { draftId?: unknown };
    if (typeof draftId !== 'string') return user;
    try {
      await this.access.canSee(toSessionUser(user, this.appAdmins), draftId);
    } catch (err) {
      // No room: the client's reads of the draft already 404.
      if (err instanceof CannotSeeDraftError) return user;
      throw err;
    }
    (socket.data as SocketData).draftId = draftId;
    return user;
  }

  /** Tells everyone viewing the draft how it now is. */
  changed(draft: DraftView): void {
    this.server.to(room(draft.id)).emit('changed', draft);
  }

  /** Tells everyone viewing the draft that it no longer exists. */
  cancelled(draftId: string): void {
    this.server.to(room(draftId)).emit('cancelled');
  }
}
