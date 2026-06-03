import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  NotEquals,
} from 'class-validator';
import { StockMovementType } from '@aicos/db';

/**
 * Records a stock adjustment for a `variant × location` pair. `delta` is the
 * signed change applied to {@link InventoryItem.onHand}; `type` is the ledger
 * classification written to the {@link StockMovement} (using the schema's
 * {@link StockMovementType} enum). `reason` is free text stored on the movement.
 */
export class CreateAdjustmentDto {
  @IsString()
  @MaxLength(64)
  variantId!: string;

  @IsString()
  @MaxLength(64)
  locationId!: string;

  /** Signed quantity change. Must be non-zero. */
  @IsInt()
  @NotEquals(0, { message: 'delta must be a non-zero integer' })
  delta!: number;

  @IsEnum(StockMovementType)
  type!: StockMovementType;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
