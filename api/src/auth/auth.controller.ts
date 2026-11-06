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
/** The in-app path to return to once sign-in finishes. */
const RETURN_TO_COOKIE = 'oauth_return_to';
const SCOPES = 'identify guilds.members.read';
/** Discord names itself in ?iss= on the callback (RFC 9207). */
const DISCORD_ISSUER = 'https://discord.com';

/** A single leading `/`, then no backslash, space or control character. */
// oxlint-disable-next-line no-control-regex -- control characters are what it rejects
const IN_APP_PATH = /^\/(?![/\\])[^\\\x00-\x20\x7f]*$/;

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly config: DiscordConfig,
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  @Get('discord')
  signIn(@Query('returnTo') returnTo: unknown, @Res() res: Response) {
    const state = randomBytes(24).toString('base64url');
    const signInCookie = { ...this.cookieOptions(), maxAge: 10 * 60 * 1000 };
    res.cookie(STATE_COOKIE, state, signInCookie);
    res.cookie(RETURN_TO_COOKIE, inAppPath(returnTo), signInCookie);
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
    const returnTo = inAppPath(req.cookies?.[RETURN_TO_COOKIE]);
    res.clearCookie(STATE_COOKIE, this.cookieOptions());
    res.clearCookie(RETURN_TO_COOKIE, this.cookieOptions());
    // Discord sends ?error=… instead of a code when the user cancels.
    if (
      !sameSecret(state, expectedState) ||
      (issuer !== undefined && issuer !== DISCORD_ISSUER) ||
      typeof code !== 'string'
    ) {
      return res.redirect(signInErrorPath('failed', returnTo));
    }

    let session: NewSession;
    try {
      session = await this.auth.signIn(code);
    } catch (err) {
      if (err instanceof NotAllowedError) {
        this.logger.log(err.message);
        return res.redirect(signInErrorPath('not-allowed', returnTo));
      }
      this.logger.error('Discord sign-in failed', err);
      return res.redirect(signInErrorPath('failed', returnTo));
    }
    res.cookie(SESSION_COOKIE, session.token, {
      ...this.cookieOptions(),
      expires: session.expiresAt,
    });
    res.redirect(returnTo);
  }

  @Get('me')
  @UseGuards(SessionGuard)
  me(@CurrentUser() user: SessionUser): UserView {
    return {
      id: user.id,
      name: user.name,
      avatarUrl: avatarUrl(user),
      isAppAdmin: user.isAppAdmin,
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

/**
 * The path of the sign-in page, showing why sign-in failed and keeping the
 * page to return to, so a retry still returns there.
 */
function signInErrorPath(error: SignInError, returnTo: string): string {
  const query = new URLSearchParams({ error });
  if (returnTo !== '/') query.set('returnTo', returnTo);
  return `/sign-in?${query}`;
}

/**
 * `path` if it is a path within this app, else `/`: the sign-in must not
 * send anyone off-site. Rejects `//host` and `/\host`, which browsers read as
 * another host, and control characters, which browsers strip before reading.
 */
function inAppPath(path: unknown): string {
  return typeof path === 'string' && IN_APP_PATH.test(path) ? path : '/';
}
