import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

/** Search query: pagination (page/pageSize → skip/take) plus an optional term. */
export class SearchQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}
