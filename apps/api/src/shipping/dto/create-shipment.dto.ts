import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/**
 * Create a shipment/fulfillment for an order. Either record a carrier + tracking
 * manually, or set `buyLabel: true` to purchase a label via Shippo (when
 * SHIPPO_API_KEY + ship-from/ship-to addresses are present; falls back to manual).
 */
export class CreateShipmentDto {
  /** Purchase a label via Shippo instead of manual carrier entry. */
  @IsOptional()
  @IsBoolean()
  buyLabel?: boolean;

  /** Parcel dimensions for the rate request (cm); sensible defaults applied. */
  @IsOptional()
  @IsInt()
  @Min(1)
  lengthCm?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  widthCm?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  heightCm?: number;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  carrier?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  service?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  trackingNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  trackingUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  rateAmountCents?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  weightGrams?: number;
}
