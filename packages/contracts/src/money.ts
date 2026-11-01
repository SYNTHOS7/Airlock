import { z } from 'zod';

/**
 * Monetary representation: integer minor units + 3-letter currency code (ISO 4217).
 * Example: $20.00 USD is represented as { amount_minor: 2000, currency: 'USD' }.
 * Never uses floating-point numbers for financial calculations.
 */
export const MoneySchema = z.object({
  amount_minor: z
    .number()
    .int('Amount in minor units must be an integer')
    .nonnegative('Amount in minor units must be non-negative')
    .max(Number.MAX_SAFE_INTEGER, 'Amount exceeds maximum safe integer'),
  currency: z
    .string()
    .length(3, 'Currency code must be 3 characters')
    .regex(/^[A-Z]{3}$/, 'Currency code must be uppercase ISO 4217 letters')
    .default('USD'),
});

export type Money = z.infer<typeof MoneySchema>;

/**
 * Creates a Money instance from major units (e.g., 20.00 USD).
 */
export function createMoney(majorUnits: number | string, currency = 'USD'): Money {
  const numeric = typeof majorUnits === 'string' ? parseFloat(majorUnits) : majorUnits;
  if (isNaN(numeric) || numeric < 0) {
    throw new Error(`Invalid monetary amount: ${majorUnits}`);
  }
  // Math.round ensures minor unit rounding without floating point drift (e.g., 19.99 * 100)
  const minor = Math.round(numeric * 100);
  return MoneySchema.parse({
    amount_minor: minor,
    currency: currency.toUpperCase(),
  });
}

/**
 * Creates a Money instance directly from minor units (cents).
 */
export function fromMinor(minorUnits: number, currency = 'USD'): Money {
  return MoneySchema.parse({
    amount_minor: minorUnits,
    currency: currency.toUpperCase(),
  });
}

/**
 * Converts Money to major unit decimal number (e.g., 2000 cents -> 20.00).
 */
export function toMajorUnits(money: Money): number {
  return money.amount_minor / 100;
}

/**
 * Formats Money for human readability or provider decimal string (e.g., "20.00").
 */
export function toDecimalString(money: Money): string {
  return (money.amount_minor / 100).toFixed(2);
}

/**
 * Formats Money for human display (e.g., "$20.00 USD").
 */
export function formatMoney(money: Money): string {
  return `$${toDecimalString(money)} ${money.currency}`;
}

/**
 * Asserts two Money objects have the same currency.
 */
function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new Error(`Currency mismatch: cannot operate on ${a.currency} and ${b.currency}`);
  }
}

/**
 * Adds two Money amounts of the same currency.
 */
export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return fromMinor(a.amount_minor + b.amount_minor, a.currency);
}

/**
 * Subtracts Money b from Money a. Throws if result is negative or currencies differ.
 */
export function subtractMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  const result = a.amount_minor - b.amount_minor;
  if (result < 0) {
    throw new Error(`Insufficient funds: cannot subtract ${formatMoney(b)} from ${formatMoney(a)}`);
  }
  return fromMinor(result, a.currency);
}

/**
 * Compares two Money objects of the same currency.
 * Returns -1 if a < b, 0 if a == b, 1 if a > b.
 */
export function compareMoney(a: Money, b: Money): number {
  assertSameCurrency(a, b);
  if (a.amount_minor < b.amount_minor) return -1;
  if (a.amount_minor > b.amount_minor) return 1;
  return 0;
}

/**
 * Checks if a Money amount is zero.
 */
export function isZero(money: Money): boolean {
  return money.amount_minor === 0;
}

