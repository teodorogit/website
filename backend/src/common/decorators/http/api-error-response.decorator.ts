import { HttpStatus, applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { ERROR_CODE, ErrorCode } from '../../errors/error-code';
import { ErrorDetail, ErrorResponse } from '../../errors/error-response';
import errorCodePtBr from '../../i18n/error-code.pt-BR';

function example(code: ErrorCode, details?: ErrorDetail[]): ErrorResponse {
    return { error: { code, message: errorCodePtBr[code], ...(details && { details }) } };
}

/** Documents one error status with the uniform envelope; pass several codes when a route can return more than one. */
export function ApiErrorResponse(status: HttpStatus, ...codes: ErrorCode[]): MethodDecorator & ClassDecorator {
    const [first] = codes;

    return applyDecorators(
        ApiResponse({
            status,
            type: ErrorResponse,
            ...(codes.length > 0 && { description: `error.code: ${codes.join(' | ')}` }),
            ...(first && { example: example(first) }),
        }),
    );
}

export const ApiValidationErrorResponse = (): MethodDecorator & ClassDecorator =>
    applyDecorators(
        ApiResponse({
            status: HttpStatus.BAD_REQUEST,
            type: ErrorResponse,
            example: example(ERROR_CODE.VALIDATION_ERROR, [{ field: 'quantity', message: 'Deve ser maior que zero.' }]),
        }),
    );

export const ApiUnauthorizedErrorResponse = (): MethodDecorator & ClassDecorator =>
    ApiErrorResponse(HttpStatus.UNAUTHORIZED, ERROR_CODE.UNAUTHORIZED);

export const ApiNotFoundErrorResponse = (code: ErrorCode): MethodDecorator & ClassDecorator =>
    ApiErrorResponse(HttpStatus.NOT_FOUND, code);

export const ApiConflictErrorResponse = (code: ErrorCode): MethodDecorator & ClassDecorator =>
    ApiErrorResponse(HttpStatus.CONFLICT, code);
