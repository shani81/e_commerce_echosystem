import { IsEmail, IsOptional, IsString } from 'class-validator';

/** Start checkout for a cart (addressed by its token). */
export class CreateCheckoutDto {
  @IsString()
  token!: string;

  /** Pre-fills the Stripe Checkout email field; Stripe collects it otherwise. */
  @IsOptional()
  @IsEmail()
  email?: string;
}
