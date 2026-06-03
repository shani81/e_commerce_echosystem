import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { ConnectService } from './connect.service';
import { ConnectController } from './connect.controller';

/**
 * Stripe Connect module (admin). Imports BillingModule for the shared
 * StripeService; exports ConnectService so the worker-driven `account.updated`
 * sync path and checkout can reuse it if needed.
 */
@Module({
  imports: [BillingModule],
  controllers: [ConnectController],
  providers: [ConnectService],
  exports: [ConnectService],
})
export class ConnectModule {}
