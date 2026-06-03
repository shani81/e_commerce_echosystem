import { IsEnum, IsOptional } from 'class-validator';
import { DsarStatus } from '@aicos/db';
import { PaginationDto } from '../../common/dto/pagination.dto';

/** Paginated DSAR request listing with an optional status filter. */
export class ListDsarDto extends PaginationDto {
  @IsOptional()
  @IsEnum(DsarStatus)
  status?: DsarStatus;
}
