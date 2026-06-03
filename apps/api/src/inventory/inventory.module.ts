import { Module } from '@nestjs/common';
import { LocationsService } from './locations.service';
import { LocationsController } from './locations.controller';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';

/**
 * Inventory module — tenant-scoped APIs over InventoryLocation, InventoryItem
 * and the append-only StockMovement ledger. PrismaService comes from the global
 * PrismaModule; the JWT strategy/guards come from AuthModule (wired globally),
 * so this module only registers its own controllers & services.
 */
@Module({
  controllers: [LocationsController, InventoryController],
  providers: [LocationsService, InventoryService],
  exports: [LocationsService, InventoryService],
})
export class InventoryModule {}
