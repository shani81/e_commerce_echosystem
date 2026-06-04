import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { PortalService } from './portal.service';
import { OrderLookupDto } from './dto/order-lookup.dto';
import { RequestReturnDto } from './dto/request-return.dto';

/**
 * PUBLIC customer portal (→ `/api/v1/storefront/:storeSlug/...`). Guest order
 * lookup + return requests, no login (email + order number).
 */
@Controller('storefront/:storeSlug')
export class PortalController {
  constructor(private readonly portal: PortalService) {}

  @Public()
  @Post('orders/lookup')
  lookup(@Param('storeSlug') storeSlug: string, @Body() dto: OrderLookupDto) {
    return this.portal.lookupOrder(storeSlug, dto);
  }

  @Public()
  @Post('returns')
  requestReturn(@Param('storeSlug') storeSlug: string, @Body() dto: RequestReturnDto) {
    return this.portal.requestReturn(storeSlug, dto);
  }

  @Public()
  @Get('returns/:id')
  getReturn(
    @Param('storeSlug') storeSlug: string,
    @Param('id') id: string,
    @Query('email') email: string,
  ) {
    return this.portal.getReturn(storeSlug, id, email);
  }
}
