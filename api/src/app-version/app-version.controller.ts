import { Controller, Get, UseGuards } from '@nestjs/common';
import { AppAdminGuard } from '../auth/app-admin.guard.js';
import type { AppVersionView } from 'contract';
import { AppVersion } from './app-version.js';

/** Tells app admins which version of the app is live. */
@Controller('admin/app-version')
@UseGuards(AppAdminGuard)
export class AppVersionController {
  constructor(private readonly version: AppVersion) {}

  @Get()
  get(): AppVersionView {
    return { commit: this.version.commit };
  }
}
