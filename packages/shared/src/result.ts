// A tiny, dependency-free `Result` type for modelling fallible operations
// without throwing. Prefer this for expected/recoverable failures (validation,
// lookups); reserve thrown `AppError`s for exceptional control flow.

/** Success branch carrying a value of type `T`. */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

/** Failure branch carrying an error of type `E`. */
export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

/** A value that is either an `Ok<T>` or an `Err<E>`. */
export type Result<T, E = Error> = Ok<T> | Err<E>;

/** Construct a success result. */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

/** Construct a failure result. */
export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

/** Type guard: narrow a `Result` to its `Ok` branch. */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

/** Type guard: narrow a `Result` to its `Err` branch. */
export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok;
}

/** Map the success value of a `Result`, leaving an `Err` untouched. */
export function mapResult<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}

/** Return the `Ok` value or a fallback when the result is an `Err`. */
export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
  return result.ok ? result.value : fallback;
}
