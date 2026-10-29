import {
  Controller,
  Get,
  HttpCode,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import type { User } from '../generated/prisma/client.js';
import { AuthService } from './auth.service.js';
import { DiscordConfig } from './discord-config.js';
import { NewSession, SessionService } from './session.service.js';
import {
  CurrentUser,
  SESSION_COOKIE,
  SessionGuard,
  sessionToken,
} from './session.guard.js';

const STATE_COOKIE = 'oauth_state';
const SCOPES = 'identify guilds.members.read';
const SIGN_IN_FAILED = '/sign-in?error=failed';

export interface UserView {
  id: string;
  name: string;
  avatarUrl: string;
}

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly config: DiscordConfig,
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  @Get('discord')
  signIn(@Res() res: Response) {
    const state = randomBytes(24).toString('base64url');
    res.cookie(STATE_COOKIE, state, {
      ...this.cookieOptions(),
      maxAge: 10 * 60 * 1000,
    });
    const url = new URL('https://discord.com/oauth2/authorize');
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      scope: SCOPES,
      redirect_uri: this.config.redirectUri,
      state,
    }).toString();
    res.redirect(url.toString());
  }

  @Get('discord/callback')
  async callback(
    @Query('code') code: unknown,
    @Query('state') state: unknown,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const expectedState: unknown = req.cookies?.[STATE_COOKIE];
    res.clearCookie(STATE_COOKIE, this.cookieOptions());
    // Discord sends ?error=… instead of a code when the user cancels.
    if (
      typeof expectedState !== 'string' ||
      state !== expectedState ||
      typeof code !== 'string'
    ) {
      return res.redirect(SIGN_IN_FAILED);
    }

    let session: NewSession;
    try {
      session = await this.auth.signIn(code);
    } catch (err) {
      this.logger.error('Discord sign-in failed', err);
      return res.redirect(SIGN_IN_FAILED);
    }
    res.cookie(SESSION_COOKIE, session.token, {
      ...this.cookieOptions(),
      expires: session.expiresAt,
    });
    res.redirect('/');
  }

  @Get('me')
  @UseGuards(SessionGuard)
  me(@CurrentUser() user: User): UserView {
    return { id: user.id, name: user.name, avatarUrl: avatarUrl(user) };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = sessionToken(req);
    if (token) await this.sessions.revoke(token);
    res.clearCookie(SESSION_COOKIE, this.cookieOptions());
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      // Lax so the cookies ride along on Discord's top-level redirect back to us.
      sameSite: 'lax',
      secure: this.config.redirectUri.startsWith('https:'),
      path: '/',
    };
  }
}

/** https://docs.discord.com/developers/reference#image-formatting */
function avatarUrl({ id, avatar }: User): string {
  if (avatar) return `https://cdn.discordapp.com/avatars/${id}/${avatar}.png`;
  // Default avatar for users on the new (discriminator-less) username system.
  const index = (BigInt(id) >> 22n) % 6n;
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}
