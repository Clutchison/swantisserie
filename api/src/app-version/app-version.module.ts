import { Module } from '@nestjs/common';
import { join } from 'node:path';
import { AuthModule } from '../auth/auth.module.js';
import { AppVersionController } from './app-version.controller.js';
import { AppVersion } from './app-version.js';

/**
 * Where the build records the app version: dist/app-version.json, beside
 * main.js. This module compiles to dist/app-version/.
 */
export const APP_VERSION_FILE = join(
  import.meta.dirname,
  '../app-version.json',
);

@Module({
  imports: [AuthModule],
  controllers: [AppVersionController],
  providers: [
    {
      provide: AppVersion,
      useFactory: () => AppVersion.read(APP_VERSION_FILE),
    },
  ],
})
export class AppVersionModule {}
