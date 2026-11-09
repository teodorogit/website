import { BadRequestException } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ERROR_CODE } from '../errors/error-code';

/** Pagination for long listings (BACKEND_SCOPE.md §4): `limit` default 50, max 100, opaque `cursor`. */
export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 100;

export class CursorPaginationQuery {
    @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_LIMIT, default: DEFAULT_PAGE_LIMIT })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(MAX_PAGE_LIMIT)
    limit?: number;

    @ApiPropertyOptional({ description: 'Opaque cursor returned as `nextCursor` by the previous page.' })
    @IsOptional()
    @IsString()
    @MaxLength(512)
    cursor?: string;
}

/** `{ items, nextCursor }` — `nextCursor` is null on the last page. */
export type CursorPage<T> = {
    items: T[];
    nextCursor: string | null;
};

/** Encodes any JSON-serializable keyset position as an opaque base64url string. */
export function encodeCursor(position: Record<string, string>): string {
    return Buffer.from(JSON.stringify(position), 'utf8').toString('base64url');
}

/**
 * Decodes a cursor produced by `encodeCursor`, checking that exactly `keys` are present as strings.
 * Throws 400 INVALID_CURSOR on anything else, so tampered cursors never reach a query.
 */
export function decodeCursor<K extends string>(cursor: string, keys: readonly K[]): Record<K, string> {
    let parsed: unknown;

    try {
        parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    } catch {
        throw new BadRequestException(ERROR_CODE.INVALID_CURSOR);
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new BadRequestException(ERROR_CODE.INVALID_CURSOR);
    }

    const record = parsed as Record<string, unknown>;
    const ownKeys = Object.keys(record);

    if (ownKeys.length !== keys.length || !keys.every((key) => typeof record[key] === 'string')) {
        throw new BadRequestException(ERROR_CODE.INVALID_CURSOR);
    }

    return record as Record<K, string>;
}
