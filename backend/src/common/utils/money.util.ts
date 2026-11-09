/**
 * Money crosses the API as decimal reais (`8.5`) and is stored as integer cents (`850`)
 * (BACKEND_SCOPE.md §1/§3). Convert only at the edges: DTO → entity and entity → response DTO.
 * All arithmetic (totals, sums, goal − sold) happens on integer cents.
 */

/** Largest price, cost or goal accepted, in reais. Keeps every cents value inside a Postgres `integer`. */
export const MAX_MONEY_REAIS = 1_000_000;

/** Largest quantity for one sale. With MAX_MONEY_REAIS, one sale total stays far below Number.MAX_SAFE_INTEGER. */
export const MAX_SALE_QUANTITY = 100_000;

/**
 * Reais → cents. Rounds to the nearest cent so binary-float noise (`0.29 * 100 = 28.999…`) can't
 * drop a cent; DTO validation already rejected more than two decimal places.
 */
export function reaisToCents(reais: number): number {
    if (!Number.isFinite(reais)) {
        throw new RangeError(`Invalid money value: ${reais}`);
    }

    return Math.round(reais * 100);
}

/** Cents → reais, exact to two decimals. */
export function centsToReais(cents: number): number {
    if (!Number.isSafeInteger(cents)) {
        throw new RangeError(`Invalid cents value: ${cents}`);
    }

    return cents / 100;
}

/** Converts a SQL aggregate (`SUM(...)` comes back as bigint or Decimal-like) to a safe integer number of cents. */
export function aggregateToCents(value: bigint | number | { toString(): string } | null | undefined): number {
    if (value === null || value === undefined) {
        return 0;
    }

    const cents = typeof value === 'number' ? value : Number(value.toString());

    if (!Number.isSafeInteger(cents)) {
        throw new RangeError(`Aggregate out of safe integer range: ${value.toString()}`);
    }

    return cents;
}
