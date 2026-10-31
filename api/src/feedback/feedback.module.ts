import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { FeedbackController } from './feedback.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [FeedbackController],
})
export class FeedbackModule {}
