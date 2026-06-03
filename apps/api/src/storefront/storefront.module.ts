import { Module } from '@nestjs/common';
import { SearchModule } from '../search/search.module';
import { StorefrontService } from './storefront.service';
import { StorefrontController } from './storefront.controller';

/**
 * Public storefront module. Imports SearchModule for Meilisearch-backed browse;
 * PrismaService is global for store resolution + product detail.
 */
@Module({
  imports: [SearchModule],
  controllers: [StorefrontController],
  providers: [StorefrontService],
})
export class StorefrontModule {}
