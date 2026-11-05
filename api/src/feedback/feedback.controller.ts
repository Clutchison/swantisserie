import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import type {
  FeedbackRequest,
  FeedbackView,
  ReviewedFeedbackView,
  UnreviewedFeedbackCount,
} from 'contract';
import { MAX_FEEDBACK_LENGTH } from 'contract';
import { AdminGuard } from '../auth/admin.guard.js';
import { bodyFields } from '../request-body.js';
import { avatarUrl } from '../auth/avatar-url.js';
import {
  CurrentUser,
  SessionGuard,
  type SessionUser,
} from '../auth/session.guard.js';
import type { Feedback, User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const MAX_PAGE_URL_LENGTH = 2048;

/** Where signed-in guild members send feedback to the app admins. */
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
    const { message, pageUrl } = bodyFields<FeedbackRequest>(body);
    await this.prisma.feedback.create({
      data: {
        message: parseMessage(message),
        pageUrl: parsePageUrl(pageUrl),
        senderId: user.id,
      },
    });
  }
}

/** Where app admins review feedback; reviewed is one state they all share. */
@Controller('admin/feedback')
@UseGuards(AdminGuard)
export class AdminFeedbackController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async listUnreviewed(): Promise<FeedbackView[]> {
    const unreviewed = await this.prisma.feedback.findMany({
      where: { reviewedById: null },
      orderBy: { sentAt: 'desc' },
      include: { sender: true },
    });
    return unreviewed.map(toFeedbackView);
  }

  @Get('reviewed')
  async listReviewed(): Promise<ReviewedFeedbackView[]> {
    const reviewed = await this.prisma.feedback.findMany({
      where: { reviewedById: { not: null } },
      orderBy: { sentAt: 'desc' },
      include: { sender: true, reviewedBy: true },
    });
    return reviewed.map((feedback) => ({
      ...toFeedbackView(feedback),
      reviewedAt: feedback.reviewedAt!.toISOString(),
      reviewedBy: { name: feedback.reviewedBy!.name },
    }));
  }

  @Get('unreviewed-count')
  async countUnreviewed(): Promise<UnreviewedFeedbackCount> {
    const count = await this.prisma.feedback.count({
      where: { reviewedById: null },
    });
    return { count };
  }

  @Put(':id/reviewed')
  @HttpCode(204)
  async markReviewed(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<void> {
    // Only an unreviewed item changes, so when two app admins race the first review stands.
    const { count } = await this.prisma.feedback.updateMany({
      where: { id, reviewedById: null },
      data: { reviewedById: user.id, reviewedAt: new Date() },
    });
    if (count > 0) return;
    const matching = await this.prisma.feedback.count({ where: { id } });
    if (matching === 0) throw new NotFoundException();
  }

  @Delete(':id/reviewed')
  @HttpCode(204)
  async markUnreviewed(@Param('id') id: string): Promise<void> {
    const { count } = await this.prisma.feedback.updateMany({
      where: { id },
      data: { reviewedById: null, reviewedAt: null },
    });
    if (count === 0) throw new NotFoundException();
  }
}

function toFeedbackView({
  id,
  message,
  pageUrl,
  sentAt,
  sender,
}: Feedback & { sender: User }): FeedbackView {
  return {
    id,
    message,
    pageUrl,
    sentAt: sentAt.toISOString(),
    sender: { name: sender.name, avatarUrl: avatarUrl(sender) },
  };
}

function invalid(message: string) {
  return new BadRequestException({ error: 'invalid', message });
}

/** The message, trimmed, or a 400 saying what's wrong with it. */
function parseMessage(message: unknown): string {
  const trimmed = typeof message === 'string' ? message.trim() : '';
  if (!trimmed) throw invalid('Write your feedback first.');
  if (trimmed.length > MAX_FEEDBACK_LENGTH) {
    throw invalid(`Keep your feedback to ${MAX_FEEDBACK_LENGTH} characters.`);
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
