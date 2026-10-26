import { ValueObject } from './value-object.js';

/**
 * Attributes schema defining the state of a Money value object.
 */
export type MoneyAttributes = {
  amount: bigint;
  currency: string;
};

// Type alias preserved for backward compatibility
export type MoneyProps = MoneyAttributes;

/**
 * Converts decimal major units (e.g. 15.50 Naira or Dollars) to whole minor units (1550 Kobo or Cents).
 */
export const toMinorUnits = (majorUnitAmount: number): number => Math.round(majorUnitAmount * 100);

/**
 * Converts whole minor units (1550 Kobo or Cents) to decimal major units (15.50 Naira or Dollars).
 */
export const toMajorUnits = (minorUnitAmount: number | bigint): number => Number(minorUnitAmount) / 100;

/**
 * WHAT IT DOES:
 * An immutable Value Object representing monetary values using integer minor units (cents/kobo) and an ISO 4217 currency.
 * Provides currency-safe arithmetic (`add`, `subtract`, `multiply`) and parity checks.
 *
 * WHY IT IS WRITTEN LIKE THIS:
 * - Floating-point numbers in JavaScript (`0.1 + 0.2 = 0.30000000000000004`) lead to critical financial rounding errors.
 *   Storing minor units as `bigint` prevents precision drift and overflow.
 * - `fromMinor()` actively rejects floating-point numbers (`!Number.isInteger(amount)`), forcing developers 
 *   to deal exclusively with whole minor units.
 * - Currency codes are normalized and strictly validated to ISO 4217 standard (3 characters).
 * - `assertCurrencyMatch()` prevents catastrophic business logic bugs like adding 100 USD to 100 NGN.
 * - `multiply()` rounds float multipliers to the nearest integer cent (`Math.round`) and guards against `NaN` / `Infinity`.
 * - Every arithmetic operation returns a brand-new `Money` instance, preserving strict immutability.
 */
export class Money extends ValueObject<MoneyAttributes> {
  private constructor(moneyAttributes: MoneyAttributes) {
    super(moneyAttributes);
  }

  /**
   * Factory method creating a Money instance from minor units and an ISO currency code.
   */
  public static fromMinor = (
    minorUnitAmount: bigint | number,
    isoCurrencyCode: string
  ): Money => {
    let resolvedMinorUnits: bigint;

    if (typeof minorUnitAmount === 'number') {
      if (!Number.isInteger(minorUnitAmount)) {
        throw new Error(`Float values are disallowed for minor money units. Received: ${minorUnitAmount}`);
      }
      resolvedMinorUnits = BigInt(minorUnitAmount);
    } else {
      resolvedMinorUnits = minorUnitAmount;
    }

    if (!isoCurrencyCode || isoCurrencyCode.trim().length !== 3) {
      throw new Error(`Currency must be an ISO 4217 3-letter code. Received: "${isoCurrencyCode}"`);
    }

    return new Money({
      amount: resolvedMinorUnits,
      currency: isoCurrencyCode.toUpperCase().trim(),
    });
  };

  /**
   * Convenience factory helper creating zero-balance money in the specified currency.
   */
  public static zero = (isoCurrencyCode: string): Money => {
    return Money.fromMinor(0n, isoCurrencyCode);
  };

  public get amount(): bigint {
    return this.immutableAttributes.amount;
  }

  public get currency(): string {
    return this.immutableAttributes.currency;
  }

  /**
   * Adds another Money instance of identical currency.
   */
  public add = (moneyToAdd: Money): Money => {
    this.assertCurrencyMatch(moneyToAdd);
    return new Money({
      amount: this.immutableAttributes.amount + moneyToAdd.amount,
      currency: this.immutableAttributes.currency,
    });
  };

  /**
   * Subtracts another Money instance of identical currency.
   */
  public subtract = (moneyToSubtract: Money): Money => {
    this.assertCurrencyMatch(moneyToSubtract);
    return new Money({
      amount: this.immutableAttributes.amount - moneyToSubtract.amount,
      currency: this.immutableAttributes.currency,
    });
  };

  /**
   * Multiplies money by a multiplier factor (integer, bigint, or decimal percentage).
   * Decimal multipliers are safely rounded to the nearest minor unit.
   */
  public multiply = (multiplicationFactor: number | bigint): Money => {
    if (typeof multiplicationFactor === 'number') {
      if (!Number.isFinite(multiplicationFactor)) {
        throw new Error('Multiplier must be a finite number.');
      }
      const roundedAmount = BigInt(Math.round(Number(this.immutableAttributes.amount) * multiplicationFactor));
      return new Money({
        amount: roundedAmount,
        currency: this.immutableAttributes.currency,
      });
    }

    return new Money({
      amount: this.immutableAttributes.amount * multiplicationFactor,
      currency: this.immutableAttributes.currency,
    });
  };

  public isZero = (): boolean => this.immutableAttributes.amount === 0n;

  public isNegative = (): boolean => this.immutableAttributes.amount < 0n;

  public isPositive = (): boolean => this.immutableAttributes.amount > 0n;

  /**
   * Invariant assertion ensuring both money instances share the identical currency.
   */
  private assertCurrencyMatch = (comparisonMoney: Money): void => {
    if (this.immutableAttributes.currency !== comparisonMoney.currency) {
      throw new Error(
        `Currency mismatch: cannot perform operation between "${this.immutableAttributes.currency}" and "${comparisonMoney.currency}".`
      );
    }
  };
}
