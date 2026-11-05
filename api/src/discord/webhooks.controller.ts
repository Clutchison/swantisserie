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
import type {
  WebhookWithUrlView,
  NewWebhookRequest,
  WebhookRegistryProblem,
  WebhookRenameRequest,
  WebhookView,
} from 'contract';
import { bodyFields } from '../request-body.js';
import type { Webhook } from '../generated/prisma/client.js';
import { AppAdminGuard } from '../auth/app-admin.guard.js';
import { SessionGuard } from '../auth/session.guard.js';
import {
  type NewWebhook,
  WebhookNameTakenError,
  WebhooksService,
} from './webhooks.service.js';

const MAX_NAME_LENGTH = 100;
/** Discord's webhook URLs, on any of its hosts: /api/webhooks/{id}/{token}. */
const WEBHOOK_URL =
  /^https:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/api\/(?:v\d+\/)?webhooks\/\d+\/[\w-]+$/;

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
@UseGuards(AppAdminGuard)
export class WebhookRegistryController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Get()
  async list(): Promise<WebhookWithUrlView[]> {
    return (await this.webhooks.list()).map(toViewWithUrl);
  }

  @Post()
  async add(@Body() body: unknown): Promise<WebhookWithUrlView> {
    const webhook = parseNewWebhook(body);
    return toViewWithUrl(await refuseTakenName(this.webhooks.add(webhook)));
  }

  @Patch(':id')
  async rename(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<WebhookWithUrlView> {
    const name = parseName(bodyFields<WebhookRenameRequest>(body).name);
    const renamed = await refuseTakenName(this.webhooks.rename(id, name));
    if (!renamed) throw new NotFoundException();
    return toViewWithUrl(renamed);
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
      const problem: WebhookRegistryProblem = {
        error: 'name-taken',
        message: err.message,
      };
      throw new ConflictException(problem);
    }
    throw err;
  }
}

function invalid(message: string) {
  const problem: WebhookRegistryProblem = { error: 'invalid', message };
  return new BadRequestException(problem);
}

/** The add form's fields, or a 400 saying which one to fix. */
function parseNewWebhook(body: unknown): NewWebhook {
  const { name, url } = bodyFields<NewWebhookRequest>(body);
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

function toViewWithUrl({ id, name, url }: Webhook): WebhookWithUrlView {
  return { id, name, url };
}
