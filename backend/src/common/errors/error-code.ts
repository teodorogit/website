import { ObjectValues } from '../types/types';

/**
 * Every `error.code` the API can return (BACKEND_SCOPE.md §1).
 *
 * Throw a Nest exception whose message is one of these values, e.g.
 * `throw new NotFoundException(ERROR_CODE.PRODUCT_NOT_FOUND)`; `AllExceptionsFilter`
 * turns it into `{ error: { code, message } }` with the pt-BR text from `i18n/error-code.pt-BR.ts`.
 * Adding a code without a translation is a compile error (the map is `Record<ErrorCode, string>`).
 */
export const ERROR_CODE = {
    // Generic, inferred from the HTTP status when a handler throws a bare exception.
    BAD_REQUEST: 'BAD_REQUEST',
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    UNAUTHORIZED: 'UNAUTHORIZED',
    FORBIDDEN: 'FORBIDDEN',
    NOT_FOUND: 'NOT_FOUND',
    CONFLICT: 'CONFLICT',
    PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
    TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
    INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
    BAD_GATEWAY: 'BAD_GATEWAY',
    SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',

    // Pagination
    INVALID_CURSOR: 'INVALID_CURSOR',

    // Products
    PRODUCT_NOT_FOUND: 'PRODUCT_NOT_FOUND',
    PRODUCT_NAME_CONFLICT: 'PRODUCT_NAME_CONFLICT',
    PRODUCT_LIMIT_REACHED: 'PRODUCT_LIMIT_REACHED',

    // Sales
    SALE_NOT_FOUND: 'SALE_NOT_FOUND',
    INVALID_DATE_RANGE: 'INVALID_DATE_RANGE',
    SALE_FILTER_CONFLICT: 'SALE_FILTER_CONFLICT',

    // Chat / Ollama
    CHAT_LAST_MESSAGE_NOT_USER: 'CHAT_LAST_MESSAGE_NOT_USER',
    LLM_UNAVAILABLE: 'LLM_UNAVAILABLE',
    LLM_INVALID_RESPONSE: 'LLM_INVALID_RESPONSE',
} as const;

export type ErrorCode = ObjectValues<typeof ERROR_CODE>;

export function isErrorCode(value: unknown): value is ErrorCode {
    return typeof value === 'string' && Object.prototype.hasOwnProperty.call(ERROR_CODE, value);
}
