// AppError hierarchy — the canonical error model for the AICOS platform.
//
// Every error thrown by application code should be (or extend) `AppError` so the
// API's global exception filter can map it to a stable `ApiError` JSON body with
// a machine-readable `code` and the right HTTP `statusCode`.

/** Stable, machine-readable error codes. Keep in sync with client expectations. */
export const ERROR_CODES = {
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  TENANT_MISMATCH: 'TENANT_MISMATCH',
  PAYMENT_REQUIRED: 'PAYMENT_REQUIRED',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** Base application error. All domain errors extend this. */
export class AppError extends Error {
  /** Machine-readable error code. */
  readonly code: ErrorCode;
  /** HTTP status to surface. */
  readonly statusCode: number;
  /** Optional structured detail (field errors, hints). */
  readonly details?: unknown;
  /** Whether this is an expected/operational error (vs. a programmer bug). */
  readonly isOperational: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    statusCode = 500,
    details?: unknown,
    isOperational = true,
  ) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = isOperational;
    // Restore prototype chain for instanceof across transpilation targets.
    Object.setPrototypeOf(this, new.target.prototype);
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, new.target);
    }
  }

  /** Serialize to the transport `ApiError` shape. */
  toJSON(): { code: string; message: string; statusCode: number; details?: unknown } {
    return {
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      details: this.details,
    };
  }
}

/** 400 — malformed request. */
export class BadRequestError extends AppError {
  constructor(message = 'Bad request', details?: unknown) {
    super(ERROR_CODES.BAD_REQUEST, message, 400, details);
  }
}

/** 400 — input failed validation (carries field-level detail). */
export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: unknown) {
    super(ERROR_CODES.VALIDATION_ERROR, message, 400, details);
  }
}

/** 401 — missing or invalid credentials. */
export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', details?: unknown) {
    super(ERROR_CODES.UNAUTHORIZED, message, 401, details);
  }
}

/** 403 — authenticated but not allowed. */
export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', details?: unknown) {
    super(ERROR_CODES.FORBIDDEN, message, 403, details);
  }
}

/** 404 — resource not found (or hidden by tenant scoping). */
export class NotFoundError extends AppError {
  constructor(message = 'Not found', details?: unknown) {
    super(ERROR_CODES.NOT_FOUND, message, 404, details);
  }
}

/** 409 — state/uniqueness conflict. */
export class ConflictError extends AppError {
  constructor(message = 'Conflict', details?: unknown) {
    super(ERROR_CODES.CONFLICT, message, 409, details);
  }
}

/** 429 — too many requests. */
export class RateLimitError extends AppError {
  constructor(message = 'Too many requests', details?: unknown) {
    super(ERROR_CODES.RATE_LIMITED, message, 429, details);
  }
}

/**
 * 403 — a tenant-scoping invariant was violated (e.g. a row's tenantId does not
 * match the active tenant context). Signals a serious isolation bug.
 */
export class TenantMismatchError extends AppError {
  constructor(message = 'Tenant context mismatch', details?: unknown) {
    super(ERROR_CODES.TENANT_MISMATCH, message, 403, details);
  }
}

/** 402 — plan entitlement/billing required to proceed. */
export class PaymentRequiredError extends AppError {
  constructor(message = 'Payment required', details?: unknown) {
    super(ERROR_CODES.PAYMENT_REQUIRED, message, 402, details);
  }
}

/** 500 — unexpected internal failure (treated as non-operational). */
export class InternalError extends AppError {
  constructor(message = 'Internal server error', details?: unknown) {
    super(ERROR_CODES.INTERNAL, message, 500, details, false);
  }
}

/** Narrowing type guard for `AppError`. */
export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}
