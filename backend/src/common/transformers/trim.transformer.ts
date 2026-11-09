import { Transform } from 'class-transformer';

/** Trims string input before validation; non-strings pass through untouched so the type validator rejects them. */
export const TrimTransformer = (): PropertyDecorator =>
    Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));
