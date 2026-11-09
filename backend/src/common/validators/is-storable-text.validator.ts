import { ValidateBy } from 'class-validator';

/**
 * Text PostgreSQL can store: no NUL character (rejected by `text`/`varchar`) and well-formed UTF-16
 * (a lone surrogate can't be encoded as UTF-8). Without this both reached the database as a 500.
 */
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

export function isStorableText(value: unknown): boolean {
    return typeof value !== 'string' || (!value.includes('\u0000') && !LONE_SURROGATE.test(value));
}

export const IsStorableText = (): PropertyDecorator =>
    ValidateBy(
        { name: 'isStorableText', validator: { validate: isStorableText } },
        { message: 'Contém caracteres inválidos.' },
    );
