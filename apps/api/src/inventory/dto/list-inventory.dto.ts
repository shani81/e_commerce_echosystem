import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

/** Pagination + optional variant/location filters for the inventory list. */
export class ListInventoryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  variantId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  locationId?: string;
}
