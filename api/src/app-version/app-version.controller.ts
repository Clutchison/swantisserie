import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard.js';
import type { AppVersionView } from 'contract';
import { AppVersion } from './app-version.js';

/** Tells app admins which version of the app is live. */
@Controller('admin/app-version')
@UseGuards(AdminGuard)
export class AppVersionController {
  constructor(private readonly version: AppVersion) {}

  @Get()
  get(): AppVersionView {
    return { commit: this.version.commit };
  }
}
