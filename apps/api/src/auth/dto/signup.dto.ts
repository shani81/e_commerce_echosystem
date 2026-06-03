import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Self-serve signup: creates a Tenant + the owner User + Membership in one go.
 * `tenantSlug` becomes the tenant's URL key (subdomain); it is normalised and
 * uniqueness-checked in the service.
 */
export class SignupDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @MinLength(10, { message: 'Password must be at least 10 characters' })
  @MaxLength(128)
  password!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  tenantName!: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(63)
  @Matches(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, {
    message:
      'tenantSlug must be lowercase alphanumeric with optional internal hyphens',
  })
  tenantSlug?: string;
}
