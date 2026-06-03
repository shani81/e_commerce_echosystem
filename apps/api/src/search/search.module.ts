import { Module } from '@nestjs/common';
import { MeiliService } from './meili.service';
import { SearchIndexerService } from './search-indexer.service';
import { SearchController } from './search.controller';

/**
 * Search module. Owns the Meilisearch client + indexer and exports them so the
 * catalog module can keep the index in sync and the storefront can query it.
 * PrismaModule is global, so the indexer gets PrismaService by injection.
 */
@Module({
  controllers: [SearchController],
  providers: [MeiliService, SearchIndexerService],
  exports: [MeiliService, SearchIndexerService],
})
export class SearchModule {}
