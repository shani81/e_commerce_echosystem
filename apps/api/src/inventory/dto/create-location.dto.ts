import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Creates an {@link InventoryLocation} (a stocking site/warehouse) for the
 * active tenant. `tenantId` is taken from the authenticated principal — never
 * the request body — so it is intentionally absent here.
 */
export class CreateLocationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  addressId?: string;
}
