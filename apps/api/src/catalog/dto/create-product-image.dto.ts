import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Attach an existing MediaAsset to a product as a ProductImage. The asset must
 * already exist (uploaded via the media module); we only record the linkage,
 * sort order and alt text here.
 */
export class CreateProductImageDto {
  @IsString()
  @MinLength(1)
  mediaAssetId!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  altText?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
