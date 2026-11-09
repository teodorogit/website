import { BadRequestException, ParseUUIDPipe } from '@nestjs/common';
import { ERROR_CODE } from '../errors/error-code';
import { ErrorPayload } from '../errors/error-response';

/**
 * `@Param('id', new UuidParamPipe('id'))` — malformed ids are a 400 VALIDATION_ERROR with a
 * field detail (BACKEND_SCOPE.md §4 "Validar UUIDs"), before any query runs.
 */
export class UuidParamPipe extends ParseUUIDPipe {
    constructor(field = 'id') {
        super({
            exceptionFactory: () => {
                const payload: ErrorPayload = {
                    errorCode: ERROR_CODE.VALIDATION_ERROR,
                    details: [{ field, message: 'Deve ser um UUID válido.' }],
                };

                return new BadRequestException(payload);
            },
        });
    }
}
