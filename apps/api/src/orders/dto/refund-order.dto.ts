import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/** Refund an order. Omit `amountCents` for a full refund of the capture. */
export class RefundOrderDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  amountCents?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
