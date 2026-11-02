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
import type { SignInError, UserView } from 'contract';
import type { CookieOptions, Request, Response } from 'express';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { DiscordConfig } from '../discord/discord-config.js';
import { AuthService, NotAllowedError } from './auth.service.js';
import { avatarUrl } from './avatar-url.js';
import { NewSession, SessionService } from './session.service.js';
import {
  CurrentUser,
  SESSION_COOKIE,
  SessionGuard,
  sessionToken,
  type SessionUser,
} from './session.guard.js';

const STATE_COOKIE = 'oauth_state';
const SCOPES = 'identify guilds.members.read';
/** Discord names itself in ?iss= on the callback (RFC 9207). */
const DISCORD_ISSUER = 'https://discord.com';

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
    @Query('iss') issuer: unknown,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const expectedState: unknown = req.cookies?.[STATE_COOKIE];
    res.clearCookie(STATE_COOKIE, this.cookieOptions());
    // Discord sends ?error=… instead of a code when the user cancels.
    if (
      !sameSecret(state, expectedState) ||
      (issuer !== undefined && issuer !== DISCORD_ISSUER) ||
      typeof code !== 'string'
    ) {
      return res.redirect(signInErrorPath('failed'));
    }

    let session: NewSession;
    try {
      session = await this.auth.signIn(code);
    } catch (err) {
      if (err instanceof NotAllowedError) {
        this.logger.log(err.message);
        return res.redirect(signInErrorPath('not-allowed'));
      }
      this.logger.error('Discord sign-in failed', err);
      return res.redirect(signInErrorPath('failed'));
    }
    res.cookie(SESSION_COOKIE, session.token, {
      ...this.cookieOptions(),
      expires: session.expiresAt,
    });
    res.redirect('/');
  }

  @Get('me')
  @UseGuards(SessionGuard)
  me(@CurrentUser() user: SessionUser): UserView {
    return {
      id: user.id,
      name: user.name,
      avatarUrl: avatarUrl(user),
      isAdmin: user.isAdmin,
    };
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
      secure: this.config.secureCookies,
      path: '/',
    };
  }
}

function sameSecret(given: unknown, expected: unknown): boolean {
  if (typeof given !== 'string' || typeof expected !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The path of the sign-in page, showing why sign-in failed. */
function signInErrorPath(error: SignInError): string {
  return `/sign-in?${new URLSearchParams({ error })}`;
}
