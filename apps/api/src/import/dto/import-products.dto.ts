import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ImportProductInput {
  @IsString()
  @MaxLength(300)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  sku?: string;

  /** Price in integer minor units (cents). */
  @IsOptional()
  @IsInt()
  @Min(0)
  priceCents?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  brand?: string;
}

/**
 * Product import. Provide either a `products` array (JSON) or a raw `csv` string
 * (generic or WooCommerce export — headers are matched case-insensitively).
 */
export class ImportProductsDto {
  @IsOptional()
  @IsIn(['json', 'csv', 'woocommerce'])
  format?: 'json' | 'csv' | 'woocommerce';

  @IsOptional()
  @IsString()
  csv?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportProductInput)
  products?: ImportProductInput[];
}
