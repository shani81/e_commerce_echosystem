import { IsInt, Max, Min } from 'class-validator';

/** Set a cart line's quantity. `0` removes the line. */
export class UpdateCartItemDto {
  @IsInt()
  @Min(0)
  @Max(999)
  quantity!: number;
}
