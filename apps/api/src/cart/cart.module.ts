import { Module } from '@nestjs/common';
import { CartService } from './cart.service';
import { CartController } from './cart.controller';

/**
 * Storefront cart module (public). PrismaService is global; store resolution +
 * stock checks happen in the service. Exported so CheckoutModule can convert a
 * cart into an order.
 */
@Module({
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
