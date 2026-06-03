import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Reusable query DTO for offset pagination. With the global ValidationPipe
 * (`transform: true`), the `@Type(() => Number)` decorators coerce the raw query
 * strings into numbers before validation.
 */
export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;

  /** Prisma `skip` derived from page/pageSize. */
  get skip(): number {
    return (this.page - 1) * this.pageSize;
  }

  /** Prisma `take` derived from pageSize. */
  get take(): number {
    return this.pageSize;
  }
}

/** Standard paginated response envelope. */
export interface PaginatedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}
