import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route (or controller) as public — `JwtAuthGuard` skips token checks.
 * Used on /auth/signup, /auth/login, /auth/refresh, /health, and the Stripe
 * webhook (which authenticates via signature, not a user JWT).
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
