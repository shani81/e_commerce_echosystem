import { Module } from '@nestjs/common';
import { ImportService } from './import.service';
import { ImportController } from './import.controller';

/** Product import module (CSV / WooCommerce / JSON → DRAFT products). */
@Module({
  controllers: [ImportController],
  providers: [ImportService],
})
export class ImportModule {}
