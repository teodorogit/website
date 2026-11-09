import { BadRequestException } from '@nestjs/common';
import { decodeCursor, encodeCursor } from '../cursor-page';

describe('cursor-page', () => {
    const keys = ['occurred_at', 'id'] as const;

    it('round-trips a keyset position', () => {
        const position = { occurred_at: '2026-10-24T15:30:00.000Z', id: 'abc' };
        expect(decodeCursor(encodeCursor(position), keys)).toEqual(position);
    });

    it.each([
        ['not base64 json', '%%%'],
        ['json array', Buffer.from('[1,2]').toString('base64url')],
        ['missing key', encodeCursor({ occurred_at: 'x' })],
        ['extra key', encodeCursor({ occurred_at: 'x', id: 'y', user_id: 'z' })],
        ['non-string value', Buffer.from(JSON.stringify({ occurred_at: 1, id: 'y' })).toString('base64url')],
    ])('rejects a tampered cursor (%s) with 400 INVALID_CURSOR', (_, cursor) => {
        expect(() => decodeCursor(cursor, keys)).toThrow(BadRequestException);

        try {
            decodeCursor(cursor, keys);
        } catch (error) {
            expect((error as BadRequestException).message).toBe('INVALID_CURSOR');
        }
    });
});
