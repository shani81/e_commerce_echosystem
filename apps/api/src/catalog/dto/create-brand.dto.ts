import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Create a brand. `slug` is optional — derived from the name when omitted
 * (tenant-scoped [tenantId, slug] unique key).
 */
export class CreateBrandDto {
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
  logoUrl?: string;
}
