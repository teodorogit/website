import { ValidateIf } from 'class-validator';

/**
 * Optional field that may be omitted but never sent as `null`. Unlike `@IsOptional()` (which also
 * skips `null`), an explicit `null` still runs the type validators, so it is a 400 instead of
 * reaching `reaisToCents` or a NOT NULL column as a 500. Use it for every optional body field;
 * `PartialType` adds `@IsOptional()`, so write partial DTOs out by hand.
 */
export const IsOmittable = (): PropertyDecorator =>
    ValidateIf((_object: object, value: unknown) => value !== undefined);
