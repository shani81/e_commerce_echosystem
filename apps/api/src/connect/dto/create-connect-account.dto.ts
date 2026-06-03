import { IsOptional, IsString, Length } from 'class-validator';

/** Create the tenant's Stripe Connect (Express) account. */
export class CreateConnectAccountDto {
  /** ISO-3166-1 alpha-2 country code (defaults to the Stripe account's country). */
  @IsOptional()
  @IsString()
  @Length(2, 2)
  country?: string;
}
