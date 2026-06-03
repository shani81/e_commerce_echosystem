import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/** Add a variant to a cart (quantity defaults to 1). */
export class AddCartItemDto {
  @IsString()
  variantId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(999)
  quantity?: number;
}
