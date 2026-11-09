import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { ERROR_CODE, ErrorCode, isErrorCode } from '../errors/error-code';
import { ErrorDetail, ErrorResponse } from '../errors/error-response';
import { isAbortError } from '../errors/request-aborted.error';
import errorCodePtBr from '../i18n/error-code.pt-BR';

type ResolvedError = {
    status: number;
    code: ErrorCode;
    details?: ErrorDetail[];
};

const CODE_BY_STATUS: Partial<Record<number, ErrorCode>> = {
    [HttpStatus.BAD_REQUEST]: ERROR_CODE.BAD_REQUEST,
    [HttpStatus.UNAUTHORIZED]: ERROR_CODE.UNAUTHORIZED,
    [HttpStatus.FORBIDDEN]: ERROR_CODE.FORBIDDEN,
    [HttpStatus.NOT_FOUND]: ERROR_CODE.NOT_FOUND,
    [HttpStatus.CONFLICT]: ERROR_CODE.CONFLICT,
    [HttpStatus.PAYLOAD_TOO_LARGE]: ERROR_CODE.PAYLOAD_TOO_LARGE,
    [HttpStatus.TOO_MANY_REQUESTS]: ERROR_CODE.TOO_MANY_REQUESTS,
    [HttpStatus.INTERNAL_SERVER_ERROR]: ERROR_CODE.INTERNAL_SERVER_ERROR,
    [HttpStatus.BAD_GATEWAY]: ERROR_CODE.BAD_GATEWAY,
    [HttpStatus.SERVICE_UNAVAILABLE]: ERROR_CODE.SERVICE_UNAVAILABLE,
};

function codeFromStatus(status: number): ErrorCode {
    const code = CODE_BY_STATUS[status];
    if (code) {
        return code;
    }

    return status >= 500 ? ERROR_CODE.INTERNAL_SERVER_ERROR : ERROR_CODE.BAD_REQUEST;
}

function isErrorDetailArray(value: unknown): value is ErrorDetail[] {
    return (
        Array.isArray(value) &&
        value.every(
            (item) =>
                typeof item === 'object' &&
                item !== null &&
                typeof (item as ErrorDetail).field === 'string' &&
                typeof (item as ErrorDetail).message === 'string',
        )
    );
}

function resolveHttpException(exception: HttpException): ResolvedError {
    const status = exception.getStatus();
    const response = exception.getResponse();

    if (typeof response === 'object' && response !== null) {
        const payload = response as Record<string, unknown>;

        // `new XException({ errorCode, details })`
        if (isErrorCode(payload['errorCode'])) {
            return {
                status,
                code: payload['errorCode'],
                ...(isErrorDetailArray(payload['details']) && { details: payload['details'] }),
            };
        }

        // `new XException(ERROR_CODE.X)` → Nest wraps it as `{ message: 'X', ... }`
        if (isErrorCode(payload['message'])) {
            return { status, code: payload['message'] };
        }
    }

    if (isErrorCode(response)) {
        return { status, code: response };
    }

    return { status, code: codeFromStatus(status) };
}

/** body-parser / raw-body errors carry `status` + `type` and never reach Nest as HttpExceptions. */
function resolveHttpLikeError(exception: unknown): ResolvedError | null {
    if (typeof exception !== 'object' || exception === null) {
        return null;
    }

    const { status, statusCode, expose } = exception as { status?: unknown; statusCode?: unknown; expose?: unknown };
    const httpStatus = typeof status === 'number' ? status : typeof statusCode === 'number' ? statusCode : undefined;

    if (httpStatus === undefined || expose !== true || httpStatus < 400 || httpStatus >= 500) {
        return null;
    }

    return { status: httpStatus, code: codeFromStatus(httpStatus) };
}

function connectionIsClosed(request: Request, response: Response): boolean {
    return response.headersSent || response.writableEnded || response.destroyed || request.socket?.destroyed === true;
}

/**
 * Single exit point for errors. Produces `{ error: { code, message, details? } }` (BACKEND_SCOPE.md §1):
 * - the message always comes from the pt-BR error-code table, never from the thrown error, so
 *   stack traces, internal messages, secrets and prompts can't leak;
 * - unknown errors become 500 and are logged with their stack server-side only;
 * - when the client already disconnected (chat "Stop"), nothing is written and aborts are not logged as failures.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
    private readonly logger = new Logger('Exception');

    catch(exception: unknown, host: ArgumentsHost): void {
        const ctx = host.switchToHttp();
        const request = ctx.getRequest<Request>();
        const response = ctx.getResponse<Response>();

        if (connectionIsClosed(request, response)) {
            if (!isAbortError(exception)) {
                this.logger.warn(
                    `method=${request.method} path="${request.originalUrl}" error after client disconnected: ${describe(exception)}`,
                );
            }

            return;
        }

        const resolved =
            exception instanceof HttpException
                ? resolveHttpException(exception)
                : (resolveHttpLikeError(exception) ?? {
                      status: HttpStatus.INTERNAL_SERVER_ERROR,
                      code: ERROR_CODE.INTERNAL_SERVER_ERROR,
                  });

        const logLine = `method=${request.method} path="${request.originalUrl}" status=${resolved.status} code=${resolved.code}`;

        if (resolved.status >= 500) {
            this.logger.error(logLine, exception instanceof Error ? exception.stack : describe(exception));
        } else {
            this.logger.warn(logLine);
        }

        const body: ErrorResponse = {
            error: {
                code: resolved.code,
                message: errorCodePtBr[resolved.code],
                ...(resolved.details && { details: resolved.details }),
            },
        };

        response.status(resolved.status).json(body);
    }
}

function describe(exception: unknown): string {
    if (exception instanceof Error) {
        return `${exception.name}: ${exception.message}`;
    }

    return String(exception);
}
