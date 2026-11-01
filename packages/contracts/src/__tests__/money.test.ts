import { describe, it, expect } from 'vitest';
import {
  createMoney,
  fromMinor,
  toMajorUnits,
  toDecimalString,
  formatMoney,
  addMoney,
  subtractMoney,
  compareMoney,
  isZero,
  MoneySchema,
} from '../money.js';

describe('Contracts: Money (Minor Units & Currency)', () => {
  it('creates money from major units with integer cents', () => {
    const m = createMoney(20.0, 'USD');
    expect(m.amount_minor).toBe(2000);
    expect(m.currency).toBe('USD');
    expect(toMajorUnits(m)).toBe(20.0);
    expect(toDecimalString(m)).toBe('20.00');
    expect(formatMoney(m)).toBe('$20.00 USD');
  });

  it('correctly rounds floating point inputs without drift (e.g. 19.99)', () => {
    const m = createMoney(19.99, 'USD');
    expect(m.amount_minor).toBe(1999);
    expect(toMajorUnits(m)).toBe(19.99);
  });

  it('creates money directly from minor units', () => {
    const m = fromMinor(5000, 'USD');
    expect(m.amount_minor).toBe(5000);
    expect(toMajorUnits(m)).toBe(50.0);
  });

  it('adds money of identical currency', () => {
    const a = createMoney(25.5, 'USD');
    const b = createMoney(10.25, 'USD');
    const sum = addMoney(a, b);
    expect(sum.amount_minor).toBe(3575);
    expect(toMajorUnits(sum)).toBe(35.75);
  });

  it('subtracts money of identical currency', () => {
    const a = createMoney(50.0, 'USD');
    const b = createMoney(15.75, 'USD');
    const diff = subtractMoney(a, b);
    expect(diff.amount_minor).toBe(3425);
    expect(toMajorUnits(diff)).toBe(34.25);
  });

  it('throws on currency mismatch during arithmetic', () => {
    const usd = createMoney(10, 'USD');
    const eur = createMoney(10, 'EUR');
    expect(() => addMoney(usd, eur)).toThrow(/Currency mismatch/);
    expect(() => subtractMoney(usd, eur)).toThrow(/Currency mismatch/);
    expect(() => compareMoney(usd, eur)).toThrow(/Currency mismatch/);
  });

  it('throws when subtraction would result in negative balance', () => {
    const small = createMoney(10, 'USD');
    const large = createMoney(20, 'USD');
    expect(() => subtractMoney(small, large)).toThrow(/Insufficient funds/);
  });

  it('compares money amounts correctly', () => {
    const m10 = createMoney(10, 'USD');
    const m20 = createMoney(20, 'USD');
    const m10b = createMoney(10, 'USD');

    expect(compareMoney(m10, m20)).toBe(-1);
    expect(compareMoney(m20, m10)).toBe(1);
    expect(compareMoney(m10, m10b)).toBe(0);
  });

  it('checks for zero amount', () => {
    expect(isZero(createMoney(0, 'USD'))).toBe(true);
    expect(isZero(createMoney(0.01, 'USD'))).toBe(false);
  });

  it('enforces schema validation rules', () => {
    // Non-negative integer required
    expect(() => MoneySchema.parse({ amount_minor: -100, currency: 'USD' })).toThrow();
    // Non-integer rejected
    expect(() => MoneySchema.parse({ amount_minor: 12.34, currency: 'USD' })).toThrow();
    // Invalid currency format rejected
    expect(() => MoneySchema.parse({ amount_minor: 100, currency: 'us' })).toThrow();
    expect(() => MoneySchema.parse({ amount_minor: 100, currency: '123' })).toThrow();
  });
});

