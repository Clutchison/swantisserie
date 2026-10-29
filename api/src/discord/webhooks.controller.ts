import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { Webhook } from '../generated/prisma/client.js';
import { AdminGuard } from '../auth/admin.guard.js';
import { SessionGuard } from '../auth/session.guard.js';
import {
  type NewWebhook,
  WebhookNameTakenError,
  WebhooksService,
  type WebhookView,
} from './webhooks.service.js';

const MAX_NAME_LENGTH = 100;
/** Discord's webhook URLs, on any of its hosts: /api/webhooks/{id}/{token}. */
const WEBHOOK_URL =
  /^https:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/api\/(?:v\d+\/)?webhooks\/\d+\/[\w-]+$/;

/** A webhook as app admins see it, URL and all. */
export interface AdminWebhookView extends WebhookView {
  url: string;
}

/** The webhooks an organizer can choose for a draft. */
@Controller('webhooks')
@UseGuards(SessionGuard)
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Get()
  async list(): Promise<WebhookView[]> {
    return (await this.webhooks.list()).map(({ id, name }) => ({ id, name }));
  }
}

/** The webhook registry, for app admins only: webhook URLs are secrets. */
@Controller('admin/webhooks')
@UseGuards(AdminGuard)
export class AdminWebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Get()
  async list(): Promise<AdminWebhookView[]> {
    return (await this.webhooks.list()).map(toAdminView);
  }

  @Post()
  async add(@Body() body: unknown): Promise<AdminWebhookView> {
    const webhook = parseNewWebhook(body);
    return toAdminView(await refuseTakenName(this.webhooks.add(webhook)));
  }

  @Patch(':id')
  async rename(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<AdminWebhookView> {
    const name = parseName(((body ?? {}) as Record<string, unknown>).name);
    const renamed = await refuseTakenName(this.webhooks.rename(id, name));
    if (!renamed) throw new NotFoundException();
    return toAdminView(renamed);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    if (!(await this.webhooks.remove(id))) throw new NotFoundException();
  }
}

async function refuseTakenName<T>(saving: Promise<T>): Promise<T> {
  try {
    return await saving;
  } catch (err) {
    if (err instanceof WebhookNameTakenError) {
      throw new ConflictException({
        error: 'name-taken',
        message: err.message,
      });
    }
    throw err;
  }
}

function invalid(message: string) {
  return new BadRequestException({ error: 'invalid', message });
}

/** The add form's fields, or a 400 saying which one to fix. */
function parseNewWebhook(body: unknown): NewWebhook {
  const { name, url } = (body ?? {}) as Record<string, unknown>;
  const trimmedUrl = typeof url === 'string' ? url.trim() : '';
  const parsedName = parseName(name);
  if (!WEBHOOK_URL.test(trimmedUrl)) {
    throw invalid('Paste the webhook’s URL from Discord.');
  }
  return { name: parsedName, url: trimmedUrl };
}

/** A webhook's name, trimmed, or a 400 saying what's wrong with it. */
function parseName(name: unknown): string {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed) throw invalid('Give the webhook a name.');
  if (trimmed.length > MAX_NAME_LENGTH) {
    throw invalid(`Keep the name to ${MAX_NAME_LENGTH} characters.`);
  }
  return trimmed;
}

function toAdminView({ id, name, url }: Webhook): AdminWebhookView {
  return { id, name, url };
}
