// Money primitives shared across the platform.
//
// AICOS stores all monetary amounts as integer MINOR units ("cents") — never
// floating point. `Cents` is a nominal/branded type so a raw `number` cannot be
// passed where cents are expected without going through one of the constructors.

declare const CentsBrand: unique symbol;

/**
 * An integer amount in the smallest currency unit (e.g. cents for USD/EUR,
 * öre for SEK). Always an integer. Branded so it is not interchangeable with a
 * plain `number`.
 */
export type Cents = number & { readonly [CentsBrand]: 'Cents' };

/** ISO-4217 currency code (e.g. "USD", "EUR", "SEK"). */
export type CurrencyCode = string;

/** A money amount: an integer minor-unit value tagged with its currency. */
export interface Money {
  amount: Cents;
  currency: CurrencyCode;
}

/**
 * Wrap an integer number of minor units as `Cents`.
 * @throws if the value is not a finite integer.
 */
export function cents(value: number): Cents {
  if (!Number.isInteger(value)) {
    throw new RangeError(`Cents must be an integer minor-unit amount, got: ${value}`);
  }
  return value as Cents;
}

/** Construct a `Money` value from an integer minor-unit amount + currency. */
export function money(amount: number, currency: CurrencyCode): Money {
  return { amount: cents(amount), currency };
}

/** Add two `Cents` values, returning `Cents`. */
export function addCents(a: Cents, b: Cents): Cents {
  return cents(a + b);
}

/** Subtract `b` from `a`, returning `Cents`. */
export function subCents(a: Cents, b: Cents): Cents {
  return cents(a - b);
}

/** Multiply `Cents` by an integer quantity (rounds to nearest cent). */
export function mulCents(amount: Cents, quantity: number): Cents {
  return cents(Math.round(amount * quantity));
}

/** The zero amount as `Cents`. */
export const ZERO_CENTS: Cents = 0 as Cents;
