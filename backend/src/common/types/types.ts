export type Prettify<T> = {
    [K in keyof T]: T[K];
} & NonNullable<unknown>;

export type MethodKeys<T> = {
    [K in keyof T]: T[K] extends (...args: any[]) => any ? K : never;
}[keyof T] &
    NonNullable<unknown>;

/** Typed `jest.fn()` bag for every method of `T` — the shape of `mockedXService` / `mockedXRepository`. */
export type JestMock<T> = Prettify<Record<MethodKeys<T>, jest.Mock>>;

/** `const X = { A: 'A' } as const; type X = ObjectValues<typeof X>;` — enums are const objects here. */
export type ObjectValues<T> = T[keyof T];

export type NullableFields<T> = { [K in keyof T]: null extends T[K] ? K : never }[keyof T];

/**
 * Constructor params for an entity class: `id`, `created_at`, `updated_at` become optional
 * (the constructor generates/defaults them) and nullable fields may be omitted.
 */
export type EntityProps<T> = Omit<T, 'id' | 'created_at' | 'updated_at' | NullableFields<T>> &
    Partial<Pick<T, NullableFields<T>>> & {
        id?: string;
        created_at?: Date;
        updated_at?: Date;
    };
