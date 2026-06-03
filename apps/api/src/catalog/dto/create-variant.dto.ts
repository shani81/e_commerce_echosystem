import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { InventoryPolicy, WeightUnit } from '@aicos/db';

/**
 * Create a product variant. Money fields are integer minor units (cents).
 * `sku` is optional — when omitted the service derives one from the titles
 * (tenant-scoped [tenantId, sku] unique key).
 */
export class CreateVariantDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  sku?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  barcode?: string;

  @IsOptional()
  @IsObject()
  options?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(0)
  priceCents?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  compareAtCents?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  costCents?: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsEnum(WeightUnit)
  weightUnit?: WeightUnit;

  @IsOptional()
  @IsEnum(InventoryPolicy)
  inventoryPolicy?: InventoryPolicy;

  @IsOptional()
  @IsBoolean()
  taxable?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}
