import { IsEnum, IsOptional } from 'class-validator';
import { ReturnStatus } from '@aicos/db';
import { PaginationDto } from '../../common/dto/pagination.dto';

/** Paginated return listing with an optional status filter. */
export class ListReturnsDto extends PaginationDto {
  @IsOptional()
  @IsEnum(ReturnStatus)
  status?: ReturnStatus;
}
