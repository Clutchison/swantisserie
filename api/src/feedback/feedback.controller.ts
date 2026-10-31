import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  SessionGuard,
  type SessionUser,
} from '../auth/session.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';

const MAX_MESSAGE_LENGTH = 2000;
const MAX_PAGE_URL_LENGTH = 2048;

/** Where signed-in role-holders send feedback to the app admins. */
@Controller('feedback')
@UseGuards(SessionGuard)
export class FeedbackController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  @HttpCode(204)
  async send(
    @CurrentUser() user: SessionUser,
    @Body() body: unknown,
  ): Promise<void> {
    const { message, pageUrl } = (body ?? {}) as Record<string, unknown>;
    await this.prisma.feedback.create({
      data: {
        message: parseMessage(message),
        pageUrl: parsePageUrl(pageUrl),
        senderId: user.id,
      },
    });
  }
}

function invalid(message: string) {
  return new BadRequestException({ error: 'invalid', message });
}

/** The message, trimmed, or a 400 saying what's wrong with it. */
function parseMessage(message: unknown): string {
  const trimmed = typeof message === 'string' ? message.trim() : '';
  if (!trimmed) throw invalid('Write your feedback first.');
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    throw invalid(`Keep your feedback to ${MAX_MESSAGE_LENGTH} characters.`);
  }
  return trimmed;
}

/** The page's URL, or a 400: app admins will open it, so it must be a web page. */
function parsePageUrl(pageUrl: unknown): string {
  if (typeof pageUrl === 'string' && pageUrl.length <= MAX_PAGE_URL_LENGTH) {
    const protocol = URL.parse(pageUrl)?.protocol;
    if (protocol === 'https:' || protocol === 'http:') return pageUrl;
  }
  throw invalid('The page URL is not valid.');
}
