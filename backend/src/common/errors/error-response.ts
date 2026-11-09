import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ERROR_CODE, ErrorCode } from './error-code';

/** One invalid field — `field` is a dotted path for nested input, e.g. `messages.3.content`. */
export class ErrorDetail {
    @ApiProperty({ example: 'quantity' })
    field!: string;

    @ApiProperty({ example: 'Deve ser maior que zero.' })
    message!: string;
}

export class ErrorBody {
    @ApiProperty({ enum: Object.values(ERROR_CODE), example: ERROR_CODE.VALIDATION_ERROR })
    code!: ErrorCode;

    @ApiProperty({ example: 'Revise os campos enviados.' })
    message!: string;

    @ApiPropertyOptional({ type: ErrorDetail, isArray: true })
    details?: ErrorDetail[];
}

/** Uniform error envelope (BACKEND_SCOPE.md §1). Never carries stack traces, secrets or prompts. */
export class ErrorResponse {
    @ApiProperty({ type: ErrorBody })
    error!: ErrorBody;
}

/**
 * Payload a handler/pipe can pass to a Nest exception to attach field details:
 * `new BadRequestException({ errorCode: ERROR_CODE.VALIDATION_ERROR, details })`.
 */
export type ErrorPayload = {
    errorCode: ErrorCode;
    details?: ErrorDetail[];
};
