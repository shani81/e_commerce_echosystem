import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReturnsService } from './returns.service';
import { ReturnsController } from './returns.controller';

/**
 * Admin returns (RMA) module. Imports BillingModule for the shared StripeService
 * (refunds) and NotificationsModule for buyer emails on approve/refund.
 */
@Module({
  imports: [BillingModule, NotificationsModule],
  controllers: [ReturnsController],
  providers: [ReturnsService],
})
export class ReturnsModule {}
