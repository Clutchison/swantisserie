import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard.js';
import { AppVersion } from './app-version.js';

export interface AppVersionView {
  commit: string | null;
}

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
