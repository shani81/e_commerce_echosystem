import { IsEnum, IsOptional } from 'class-validator';
import { OrderStatus } from '@aicos/db';
import { PaginationDto } from '../../common/dto/pagination.dto';

/** Paginated order listing with an optional status filter. */
export class ListOrdersDto extends PaginationDto {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;
}
