import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ShipmentStatus } from '@aicos/db';

/** Update a shipment's status / tracking. Moving to IN_TRANSIT notifies the buyer. */
export class UpdateShipmentDto {
  @IsOptional()
  @IsEnum(ShipmentStatus)
  status?: ShipmentStatus;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  carrier?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  trackingNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  trackingUrl?: string;
}
