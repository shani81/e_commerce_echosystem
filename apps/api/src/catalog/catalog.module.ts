import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { CategoriesService } from './categories.service';
import { CategoriesController } from './categories.controller';
import { BrandsService } from './brands.service';
import { BrandsController } from './brands.controller';
import { SearchModule } from '../search/search.module';

/**
 * Catalog module — tenant-scoped CRUD over products (+ variants & images),
 * categories and brands. PrismaService comes from the global PrismaModule and
 * the JWT strategy/guards from the globally-wired AuthModule, so this module
 * only registers its own controllers and services.
 */
@Module({
  imports: [SearchModule],
  controllers: [ProductsController, CategoriesController, BrandsController],
  providers: [ProductsService, CategoriesService, BrandsService],
  exports: [ProductsService, CategoriesService, BrandsService],
})
export class CatalogModule {}
