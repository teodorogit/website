import { applyDecorators } from '@nestjs/common';
import { IsNumber, Max, Min, ValidateBy } from 'class-validator';
import { MAX_MONEY_REAIS } from '../utils/money.util';

const MONEY_MESSAGE = 'Deve ser um valor numérico com no máximo duas casas decimais.';

/**
 * At most two decimal places, judged on the number's value rather than its string form:
 * class-validator's `IsNumber({ maxDecimalPlaces })` throws on fractions JS prints in exponent
 * form (`1e-7`), which surfaced as a 500. The tolerance absorbs binary-float noise
 * (`0.29 * 100 = 28.999…`); `reaisToCents` then rounds to the exact cent.
 */
export function hasAtMostTwoDecimals(value: unknown): boolean {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return false;
    }

    const scaled = value * 100;
    return Math.abs(scaled - Math.round(scaled)) < 1e-6;
}

/**
 * A money amount in reais: finite number, at most two decimal places, within
 * [`min`, MAX_MONEY_REAIS]. Use `{ exclusiveMin: true }` for "greater than zero".
 */
export function IsMoney(options: { min?: number; exclusiveMin?: boolean } = {}): PropertyDecorator {
    const min = options.min ?? 0;
    const minDecorator = options.exclusiveMin
        ? Min(min + 0.01, { message: `Deve ser maior que ${min}.` })
        : Min(min, { message: `Deve ser maior ou igual a ${min}.` });

    return applyDecorators(
        IsNumber({ allowNaN: false, allowInfinity: false }, { message: MONEY_MESSAGE }),
        ValidateBy({ name: 'isMoney', validator: { validate: hasAtMostTwoDecimals } }, { message: MONEY_MESSAGE }),
        minDecorator,
        Max(MAX_MONEY_REAIS, { message: `Deve ser menor ou igual a ${MAX_MONEY_REAIS}.` }),
    );
}
