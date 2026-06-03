import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ProductStatus } from '@aicos/db';
import { PaginationDto } from '../../common/dto/pagination.dto';

/** Query params for GET /products: pagination + optional filters. */
export class ListProductsDto extends PaginationDto {
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @IsOptional()
  @IsString()
  categoryId?: string;

  /** Free-text filter matched against the product title (contains). */
  @IsOptional()
  @IsString()
  q?: string;
}
