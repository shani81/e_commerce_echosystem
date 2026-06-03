import { Exclude, Type } from 'class-transformer';
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

  // @Exclude() keeps class-transformer from trying to ASSIGN these getter-only
  // props when a client passes ?skip=/?take= query params (which would throw a
  // 500 "has only a getter"). The getters still work at runtime for the services.
  /** Prisma `skip` derived from page/pageSize. */
  @Exclude()
  get skip(): number {
    return (this.page - 1) * this.pageSize;
  }

  /** Prisma `take` derived from pageSize. */
  @Exclude()
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
