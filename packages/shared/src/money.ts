// Money helpers. AICOS stores all monetary amounts as integer minor units
// ("cents") — never floating point. These helpers convert to/from the major
// decimal unit and format for display.

/** Number of minor units per major unit for a currency (e.g. 100 for USD). */
const DEFAULT_MINOR_UNITS = 100;

/** Currencies whose smallest unit is the major unit (no fractional part). */
const ZERO_DECIMAL_CURRENCIES = new Set([
  'JPY',
  'KRW',
  'VND',
  'CLP',
  'ISK',
  'HUF',
  'XOF',
  'XAF',
]);

/** Currencies with three decimal places. */
const THREE_DECIMAL_CURRENCIES = new Set(['BHD', 'KWD', 'OMR', 'TND', 'JOD']);

/** How many minor units make up one major unit of `currency`. */
function minorUnitFactor(currency: string): number {
  const code = currency.toUpperCase();
  if (ZERO_DECIMAL_CURRENCIES.has(code)) return 1;
  if (THREE_DECIMAL_CURRENCIES.has(code)) return 1000;
  return DEFAULT_MINOR_UNITS;
}

/**
 * Convert a major-unit decimal amount (e.g. 19.99) to integer minor units
 * (e.g. 1999). Rounds to the nearest minor unit.
 */
export function toCents(amount: number, currency = 'USD'): number {
  if (!Number.isFinite(amount)) {
    throw new RangeError(`toCents() requires a finite amount, got: ${amount}`);
  }
  return Math.round(amount * minorUnitFactor(currency));
}

/**
 * Convert integer minor units (e.g. 1999) back to a major-unit decimal number
 * (e.g. 19.99). Use only for display/serialization, never for arithmetic.
 */
export function fromCents(cents: number, currency = 'USD'): number {
  if (!Number.isInteger(cents)) {
    throw new RangeError(`fromCents() requires an integer cents amount, got: ${cents}`);
  }
  return cents / minorUnitFactor(currency);
}

/**
 * Format an integer minor-unit amount as a localized currency string.
 * @example formatMoney(1999, 'USD') // "$19.99"
 */
export function formatMoney(cents: number, currency = 'USD', locale = 'en-US'): string {
  const code = currency.toUpperCase();
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: code }).format(
      fromCents(cents, code),
    );
  } catch {
    // Unknown currency code — fall back to a plain decimal + code.
    return `${fromCents(cents, code).toFixed(2)} ${code}`;
  }
}
