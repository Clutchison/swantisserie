import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AdminFeedbackController, FeedbackController } from './feedback.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [FeedbackController, AdminFeedbackController],
})
export class FeedbackModule {}
