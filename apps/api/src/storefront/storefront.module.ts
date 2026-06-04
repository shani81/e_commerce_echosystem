import { Module } from '@nestjs/common';
import { SearchModule } from '../search/search.module';
import { StorefrontService } from './storefront.service';
import { StorefrontController } from './storefront.controller';
import { S3Service } from '../media/s3.service';

/**
 * Public storefront module. Imports SearchModule for Meilisearch-backed browse;
 * PrismaService is global for store resolution + product detail. S3Service
 * presigns product image URLs for the storefront.
 */
@Module({
  imports: [SearchModule],
  controllers: [StorefrontController],
  providers: [StorefrontService, S3Service],
})
export class StorefrontModule {}
