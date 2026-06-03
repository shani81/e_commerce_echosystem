import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/**
 * Creates an {@link InventoryItem} for a `variant × location` pair with an
 * initial on-hand quantity. The service also writes the seeding
 * {@link StockMovement} (`RECEIVE`) for the initial stock. Quantities are whole
 * units (never money/cents).
 */
export class CreateInventoryItemDto {
  @IsString()
  @MaxLength(64)
  variantId!: string;

  @IsString()
  @MaxLength(64)
  locationId!: string;

  /** Initial on-hand units. Defaults to 0 when omitted. */
  @IsOptional()
  @IsInt()
  @Min(0)
  onHand?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  reorderPoint?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  reorderQty?: number;
}
