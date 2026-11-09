import { aggregateToCents, centsToReais, reaisToCents } from '../money.util';

describe('money.util', () => {
    it.each([
        [3, 300],
        [8.5, 850],
        [0.29, 29], // 0.29 * 100 === 28.999999999999996
        [0, 0],
        [1_000_000, 100_000_000],
    ])('reaisToCents(%p) === %p', (reais, cents) => {
        expect(reaisToCents(reais)).toBe(cents);
    });

    it('rejects non-finite values', () => {
        expect(() => reaisToCents(Number.NaN)).toThrow(RangeError);
        expect(() => reaisToCents(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    });

    it('converts cents back to reais exactly', () => {
        expect(centsToReais(850)).toBe(8.5);
        expect(centsToReais(29)).toBe(0.29);
        expect(centsToReais(0)).toBe(0);
        expect(() => centsToReais(1.5)).toThrow(RangeError);
    });

    it('normalizes SQL aggregates', () => {
        expect(aggregateToCents(null)).toBe(0);
        expect(aggregateToCents(undefined)).toBe(0);
        expect(aggregateToCents(BigInt(12345))).toBe(12345);
        expect(aggregateToCents({ toString: () => '600' })).toBe(600);
        expect(() => aggregateToCents(BigInt('90071992547409930'))).toThrow(RangeError);
    });
});
