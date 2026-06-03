import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Create a category. `slug` is optional — derived from the name when omitted
 * (tenant-scoped [tenantId, slug] unique key). `parentId` builds the
 * self-referential tree.
 */
export class CreateCategoryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  @Matches(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, {
    message: 'slug must be lowercase alphanumeric with optional internal hyphens',
  })
  slug?: string;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}
