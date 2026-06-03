import { IsInt, IsOptional, Min } from 'class-validator';

/**
 * Updates the reorder-policy fields the schema exposes on
 * {@link InventoryItem} (`reorderPoint`, `reorderQty`). On-hand levels are NOT
 * mutable here — use the adjustments endpoint so every quantity change is
 * recorded in the append-only {@link StockMovement} ledger.
 */
export class UpdateInventoryItemDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  reorderPoint?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  reorderQty?: number;
}
