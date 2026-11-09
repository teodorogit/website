import { Prisma } from '@prisma/client';

/** P2002 — unique constraint violated (e.g. duplicate product name for the same user). */
export function isUniqueConstraintError(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** P2025 — the record an update/delete targeted does not exist (or is filtered out by the `where`). */
export function isRecordNotFoundError(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';
}
