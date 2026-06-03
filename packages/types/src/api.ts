// Transport-level API contract types shared by every NestJS service and the
// Next.js clients. These describe the JSON envelope shape — not domain models.

/**
 * The canonical error body returned by the API on a non-2xx response.
 * Mirrors the AppError hierarchy in `@aicos/shared`.
 */
export interface ApiError {
  /** Machine-readable, stable error code (e.g. "VALIDATION_ERROR"). */
  code: string;
  /** Human-readable message safe to surface to clients. */
  message: string;
  /** HTTP status code. */
  statusCode: number;
  /** Optional structured detail (field errors, hints). */
  details?: unknown;
  /** Request correlation id for tracing/support. */
  requestId?: string;
}

/** Cursor/offset pagination metadata accompanying a list payload. */
export interface PaginationMeta {
  /** 1-based page number (offset pagination). */
  page: number;
  /** Items per page requested. */
  pageSize: number;
  /** Total number of matching items across all pages. */
  total: number;
  /** Total number of pages. */
  totalPages: number;
  /** Opaque cursor for the next page (cursor pagination), if any. */
  nextCursor?: string | null;
}

/** A paginated collection of `T`. */
export interface Paginated<T> {
  items: T[];
  meta: PaginationMeta;
}

/** Successful API response envelope wrapping a data payload. */
export interface ApiSuccess<T> {
  success: true;
  data: T;
  requestId?: string;
}

/** Failure API response envelope wrapping an `ApiError`. */
export interface ApiFailure {
  success: false;
  error: ApiError;
  requestId?: string;
}

/**
 * Discriminated union of every API response. Narrow on `success` to access
 * either `data` or `error`.
 */
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
