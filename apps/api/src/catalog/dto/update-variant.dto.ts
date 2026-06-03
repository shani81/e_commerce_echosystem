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

/** Partial update of a product variant. Money fields are integer cents. */
export class UpdateVariantDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title?: string;

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
