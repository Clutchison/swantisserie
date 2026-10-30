import {
  type OnGatewayConnection,
  type OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import cookieParser from 'cookie-parser';
import type { Request, Response } from 'express';
import type { Server, Socket } from 'socket.io';
import { API_PREFIX } from '../app.setup.js';
import { sessionToken } from '../auth/session.guard.js';
import { SessionService } from '../auth/session.service.js';
import type { DraftView } from './draft-view.js';

const parseCookies = cookieParser();

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
  private readonly server!: Server;

  constructor(private readonly sessions: SessionService) {}

  /** Refuses sockets without a live session, as SessionGuard does requests. */
  afterInit(server: Server): void {
    server.use((socket, next) => {
      const req = socket.request as Request;
      parseCookies(req, {} as Response, () => {
        const token = sessionToken(req);
        (token ? this.sessions.findUser(token) : Promise.resolve(null)).then(
          (user) => next(user ? undefined : new Error('unauthorized')),
          next,
        );
      });
    });
  }

  handleConnection(socket: Socket): void {
    const { draftId } = socket.handshake.auth as { draftId?: unknown };
    if (typeof draftId === 'string') void socket.join(room(draftId));
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
