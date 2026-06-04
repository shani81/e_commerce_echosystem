import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/** Create a shipment/fulfillment for an order (manual carrier entry in P1). */
export class CreateShipmentDto {
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
