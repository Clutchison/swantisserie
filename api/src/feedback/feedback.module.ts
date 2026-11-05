import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import {
  AppAdminFeedbackController,
  FeedbackController,
} from './feedback.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [FeedbackController, AppAdminFeedbackController],
})
export class FeedbackModule {}
