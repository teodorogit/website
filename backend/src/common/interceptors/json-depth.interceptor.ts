import { BadRequestException, CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { ERROR_CODE } from '../errors/error-code';
import { ErrorPayload } from '../errors/error-response';

/** No DTO nests deeper than a few levels; this leaves ample room while staying far from the stack limit. */
export const MAX_JSON_DEPTH = 32;

/** Nesting depth of a parsed JSON value, measured iteratively so the check itself can't overflow. */
export function jsonDepth(value: unknown): number {
    let max = 0;
    const stack: Array<[unknown, number]> = [[value, 0]];

    while (stack.length > 0) {
        const [current, depth] = stack.pop() as [unknown, number];
        if (typeof current !== 'object' || current === null) {
            continue;
        }

        max = Math.max(max, depth + 1);
        if (max > MAX_JSON_DEPTH) {
            return max;
        }

        for (const child of Object.values(current)) {
            stack.push([child, depth + 1]);
        }
    }

    return max;
}

/**
 * Rejects bodies and queries nested deeper than MAX_JSON_DEPTH with 400 before the ValidationPipe runs:
 * class-transformer recurses per level, and a few KB of `[[[[…]]]]` overflowed the stack (500).
 * Interceptors run after guards and before pipes, so this sits right where it is needed.
 */
@Injectable()
export class JsonDepthInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        const request = context.switchToHttp().getRequest<Request>();

        for (const [field, value] of [
            ['body', request.body],
            ['query', request.query],
        ] as const) {
            if (jsonDepth(value) > MAX_JSON_DEPTH) {
                const payload: ErrorPayload = {
                    errorCode: ERROR_CODE.VALIDATION_ERROR,
                    details: [{ field, message: `Estrutura aninhada demais (máximo de ${MAX_JSON_DEPTH} níveis).` }],
                };
                throw new BadRequestException(payload);
            }
        }

        return next.handle();
    }
}
