import { ValidateBy } from 'class-validator';

/**
 * Max length in Unicode code points — what Postgres `char_length` / `varchar(n)` count.
 * class-validator's `MaxLength` (validator.js `isLength`) skips variation selectors
 * (U+FE0E/U+FE0F, as in "❤️"), so a value it accepts can still violate a DB length CHECK (500).
 */
export const MaxCodePoints = (max: number): PropertyDecorator =>
    ValidateBy(
        {
            name: 'maxCodePoints',
            validator: {
                // Non-strings are reported by IsString; this rule only measures text.
                validate: (value: unknown) => typeof value !== 'string' || [...value].length <= max,
            },
            constraints: [max],
        },
        { message: `Deve ter no máximo ${max} caracteres.` },
    );
