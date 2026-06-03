import { Body, Controller, Param, Post } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { CheckoutService } from './checkout.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';

/**
 * PUBLIC checkout (→ `POST /api/v1/storefront/:storeSlug/checkout`). Converts the
 * shopper's cart into an order and returns a Stripe Checkout Session URL to
 * redirect to. No auth — the shopper is anonymous.
 */
@Controller('storefront/:storeSlug/checkout')
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  @Public()
  @Post()
  create(@Param('storeSlug') storeSlug: string, @Body() dto: CreateCheckoutDto) {
    return this.checkout.checkout(storeSlug, dto);
  }
}
