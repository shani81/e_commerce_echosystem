import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';

/**
 * Admin orders module. Imports BillingModule for the shared StripeService
 * (refunds). Order data is tenant-scoped via the global PrismaService.
 */
@Module({
  imports: [BillingModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
