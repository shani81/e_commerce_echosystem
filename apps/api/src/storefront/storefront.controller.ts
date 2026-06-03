import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { SearchQueryDto } from '../search/dto/search-query.dto';
import { StorefrontService } from './storefront.service';

/**
 * PUBLIC storefront API (→ `/api/v1/storefront/...`). No auth: a shopper browses
 * a store by its slug. Everything is scoped to that store's tenant + PUBLISHED
 * products only (enforced in the service).
 */
@Controller('storefront')
export class StorefrontController {
  constructor(private readonly storefront: StorefrontService) {}

  @Public()
  @Get(':storeSlug')
  getStore(@Param('storeSlug') storeSlug: string) {
    return this.storefront.getStore(storeSlug);
  }

  @Public()
  @Get(':storeSlug/products')
  listProducts(@Param('storeSlug') storeSlug: string, @Query() query: SearchQueryDto) {
    return this.storefront.listProducts(storeSlug, {
      q: query.q,
      skip: query.skip,
      take: query.take,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Public()
  @Get(':storeSlug/products/:productSlug')
  getProduct(
    @Param('storeSlug') storeSlug: string,
    @Param('productSlug') productSlug: string,
  ) {
    return this.storefront.getProduct(storeSlug, productSlug);
  }
}
