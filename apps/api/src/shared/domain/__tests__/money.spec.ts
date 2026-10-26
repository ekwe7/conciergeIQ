import { describe, it, expect } from 'vitest';
import { Money, toMinorUnits, toMajorUnits } from '../money.js';

describe('Money Value Object', () => {
  const createMoneyInstance = (minorUnitAmount: number | bigint, isoCurrencyCode = 'USD'): Money =>
    Money.fromMinor(minorUnitAmount, isoCurrencyCode);

  describe('Instantiation & Validation', () => {
    it('creates Money from integer number and bigint in minor units', () => {
      const moneyInstantiatedFromNumber = createMoneyInstance(1500, 'usd');
      const moneyInstantiatedFromBigInt = createMoneyInstance(1500n, 'USD');

      expect(moneyInstantiatedFromNumber.amount).toBe(1500n);
      expect(moneyInstantiatedFromNumber.currency).toBe('USD');
      expect(moneyInstantiatedFromBigInt.amount).toBe(1500n);
      expect(moneyInstantiatedFromBigInt.currency).toBe('USD');
    });

    it('rejects floating-point minor unit amounts', () => {
      expect(() => createMoneyInstance(15.75, 'USD')).toThrow(/Float values are disallowed/);
      expect(() => createMoneyInstance(0.1, 'USD')).toThrow(/Float values are disallowed/);
    });

    it('rejects invalid currency codes', () => {
      expect(() => createMoneyInstance(100, '')).toThrow(/ISO 4217/);
      expect(() => createMoneyInstance(100, 'US')).toThrow(/ISO 4217/);
      expect(() => createMoneyInstance(100, 'USDT')).toThrow(/ISO 4217/);
    });

    it('creates zero amount money correctly', () => {
      const zeroBalanceMoney = Money.zero('EUR');
      expect(zeroBalanceMoney.amount).toBe(0n);
      expect(zeroBalanceMoney.currency).toBe('EUR');
      expect(zeroBalanceMoney.isZero()).toBe(true);
      expect(zeroBalanceMoney.isNegative()).toBe(false);
      expect(zeroBalanceMoney.isPositive()).toBe(false);
    });
  });

  describe('Arithmetic Operations', () => {
    it('adds money of identical currencies', () => {
      const initialAccountBalance = createMoneyInstance(2500, 'NGN');
      const incomingDepositAmount = createMoneyInstance(1500, 'NGN');
      const combinedTotalBalance = initialAccountBalance.add(incomingDepositAmount);

      expect(combinedTotalBalance.amount).toBe(4000n);
      expect(combinedTotalBalance.currency).toBe('NGN');
      expect(initialAccountBalance.amount).toBe(2500n); // Verifies immutability
    });

    it('throws error when adding money with mismatched currencies', () => {
      const unitedStatesDollars = createMoneyInstance(1000, 'USD');
      const europeanEuros = createMoneyInstance(1000, 'EUR');

      expect(() => unitedStatesDollars.add(europeanEuros)).toThrow(/Currency mismatch/);
    });

    it('subtracts money of identical currencies', () => {
      const startingFolioBalance = createMoneyInstance(5000, 'USD');
      const settledPaymentAmount = createMoneyInstance(1200, 'USD');
      const remainingUnpaidBalance = startingFolioBalance.subtract(settledPaymentAmount);

      expect(remainingUnpaidBalance.amount).toBe(3800n);
      expect(remainingUnpaidBalance.currency).toBe('USD');
    });

    it('supports subtraction resulting in negative balances', () => {
      const currentAvailableFunds = createMoneyInstance(1000, 'USD');
      const largerDebitTransaction = createMoneyInstance(2500, 'USD');
      const overdrawnBalance = currentAvailableFunds.subtract(largerDebitTransaction);

      expect(overdrawnBalance.amount).toBe(-1500n);
      expect(overdrawnBalance.isNegative()).toBe(true);
      expect(overdrawnBalance.isPositive()).toBe(false);
    });

    it('throws error when subtracting money with mismatched currencies', () => {
      const walletInDollars = createMoneyInstance(1000, 'USD');
      const expenseInPounds = createMoneyInstance(500, 'GBP');

      expect(() => walletInDollars.subtract(expenseInPounds)).toThrow(/Currency mismatch/);
    });

    it('multiplies money by integer or bigint', () => {
      const baseRoomServiceRate = createMoneyInstance(1200, 'USD');
      const tripleQuantityTotal = baseRoomServiceRate.multiply(3);
      const quadrupleQuantityTotal = baseRoomServiceRate.multiply(4n);

      expect(tripleQuantityTotal.amount).toBe(3600n);
      expect(quadrupleQuantityTotal.amount).toBe(4800n);
    });

    it('multiplies money by float and rounds to nearest minor unit', () => {
      const itemStandardPrice = createMoneyInstance(1050, 'USD');
      const fifteenPercentServiceCharge = itemStandardPrice.multiply(0.15); // 1050 * 0.15 = 157.5 -> 158

      expect(fifteenPercentServiceCharge.amount).toBe(158n);
    });

    it('rejects non-finite multipliers', () => {
      const standardMoneyInstance = createMoneyInstance(1000, 'USD');

      expect(() => standardMoneyInstance.multiply(NaN)).toThrow(/Multiplier must be a finite number/);
      expect(() => standardMoneyInstance.multiply(Infinity)).toThrow(/Multiplier must be a finite number/);
    });
  });

  describe('Equality & Predicates', () => {
    it('compares equality structurally', () => {
      const referenceUsdMoney = createMoneyInstance(2500, 'USD');
      const identicalUsdMoney = createMoneyInstance(2500n, 'USD');
      const differentCurrencyMoney = createMoneyInstance(2500, 'EUR');
      const differentAmountMoney = createMoneyInstance(3000, 'USD');

      expect(referenceUsdMoney.equals(identicalUsdMoney)).toBe(true);
      expect(referenceUsdMoney.equals(differentCurrencyMoney)).toBe(false);
      expect(referenceUsdMoney.equals(differentAmountMoney)).toBe(false);
      expect(referenceUsdMoney.equals(null)).toBe(false);
      expect(referenceUsdMoney.equals(undefined)).toBe(false);
    });

    it('evaluates sign predicates correctly', () => {
      const positiveMoneyAmount = createMoneyInstance(100, 'USD');
      const zeroMoneyAmount = createMoneyInstance(0, 'USD');
      const negativeMoneyAmount = createMoneyInstance(-100, 'USD');

      expect(positiveMoneyAmount.isPositive()).toBe(true);
      expect(positiveMoneyAmount.isNegative()).toBe(false);

      expect(zeroMoneyAmount.isZero()).toBe(true);
      expect(zeroMoneyAmount.isPositive()).toBe(false);

      expect(negativeMoneyAmount.isNegative()).toBe(true);
      expect(negativeMoneyAmount.isPositive()).toBe(false);
    });
  });

  describe('Conversion Utility Functions', () => {
    it('converts major units to minor units via toMinorUnits', () => {
      expect(toMinorUnits(15.99)).toBe(1599);
      expect(toMinorUnits(0.5)).toBe(50);
      expect(toMinorUnits(10)).toBe(1000);
    });

    it('converts minor units to major units via toMajorUnits', () => {
      expect(toMajorUnits(1599)).toBe(15.99);
      expect(toMajorUnits(1599n)).toBe(15.99);
      expect(toMajorUnits(50)).toBe(0.5);
    });
  });
});
