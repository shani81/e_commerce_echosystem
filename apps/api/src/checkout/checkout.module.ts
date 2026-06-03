import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { CheckoutService } from './checkout.service';
import { CheckoutController } from './checkout.controller';

/**
 * Checkout module (public). Imports BillingModule for the shared StripeService
 * (Checkout Session creation). Order/cart access is via the global PrismaService.
 */
@Module({
  imports: [BillingModule],
  controllers: [CheckoutController],
  providers: [CheckoutService],
})
export class CheckoutModule {}
