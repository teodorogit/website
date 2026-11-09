import { BadRequestException } from '@nestjs/common';
import { ValidationError } from 'class-validator';
import { ERROR_CODE } from '@/common/errors/error-code';
import { ErrorDetail, ErrorPayload } from '@/common/errors/error-response';

type Translator = (defaultMessage: string) => string | null;

const fixed =
    (text: string): Translator =>
    () =>
        text;

const withNumber =
    (pattern: RegExp, build: (value: string) => string): Translator =>
    (message) => {
        const match = pattern.exec(message);
        return match?.[1] ? build(match[1]) : null;
    };

/**
 * pt-BR text for class-validator's built-in constraints. Only applied to class-validator's
 * *default* English messages; a DTO that passes its own `{ message }` keeps it verbatim.
 */
const CONSTRAINT_TRANSLATIONS: Record<string, Translator> = {
    whitelistValidation: fixed('Campo não permitido.'),
    isDefined: fixed('Campo obrigatório.'),
    isNotEmpty: fixed('Não pode ser vazio.'),
    isString: fixed('Deve ser um texto.'),
    isInt: fixed('Deve ser um número inteiro.'),
    isNumber: fixed('Deve ser um número válido.'),
    isPositive: fixed('Deve ser maior que zero.'),
    isBoolean: fixed('Deve ser verdadeiro ou falso.'),
    isUuid: fixed('Deve ser um UUID válido.'),
    isIn: fixed('Valor não permitido.'),
    isEnum: fixed('Valor não permitido.'),
    isArray: fixed('Deve ser uma lista.'),
    isObject: fixed('Deve ser um objeto válido.'),
    nestedValidation: fixed('Deve ser um objeto válido.'),
    min: withNumber(/less than (-?[\d.]+)/, (n) => `Deve ser maior ou igual a ${n}.`),
    max: withNumber(/greater than (-?[\d.]+)/, (n) => `Deve ser menor ou igual a ${n}.`),
    maxLength: withNumber(/(\d+) characters/, (n) => `Deve ter no máximo ${n} caracteres.`),
    minLength: withNumber(/(\d+) characters/, (n) => `Deve ter no mínimo ${n} caracteres.`),
    arrayMaxSize: withNumber(/more than (\d+) elements/, (n) => `Deve ter no máximo ${n} itens.`),
    arrayMinSize: withNumber(/at least (\d+) elements/, (n) => `Deve ter no mínimo ${n} itens.`),
};

/** class-validator defaults read "`<property> must …`", "each value in …" or "property x should not exist". */
function isDefaultMessage(property: string, message: string): boolean {
    return (
        message.startsWith(`${property} `) || message.startsWith('each value in ') || message.startsWith('property ')
    );
}

function translate(property: string, constraint: string, message: string): string {
    if (!isDefaultMessage(property, message)) {
        return message;
    }

    return CONSTRAINT_TRANSLATIONS[constraint]?.(message) ?? 'Valor inválido.';
}

/**
 * When several constraints fail on one field, report the most fundamental one: "must be an
 * integer" explains `limit=ten` better than "must be ≤ 100". class-validator's own order depends
 * on decorator order, so it is not reliable.
 */
const CONSTRAINT_PRIORITY = [
    'whitelistValidation',
    'isDefined',
    'isString',
    'isNumber',
    'isInt',
    'isBoolean',
    'isArray',
    'isObject',
    'nestedValidation',
    'isUuid',
    'isCalendarDate',
    'isIn',
    'isEnum',
    'isNotEmpty',
];

function mostRelevantConstraint(constraints: Record<string, string>): [string, string] | undefined {
    for (const key of CONSTRAINT_PRIORITY) {
        const message = constraints[key];
        if (message !== undefined) {
            return [key, message];
        }
    }

    return Object.entries(constraints)[0];
}

/** Flattens nested errors into `{ field: 'messages.3.content', message }`, one entry per field. */
export function flattenValidationErrors(errors: ValidationError[], parentPath = ''): ErrorDetail[] {
    const details: ErrorDetail[] = [];

    for (const error of errors) {
        const field = parentPath ? `${parentPath}.${error.property}` : error.property;
        const first = mostRelevantConstraint(error.constraints ?? {});

        if (first) {
            const [constraint, message] = first;
            details.push({ field, message: translate(error.property, constraint, message) });
        }

        if (error.children?.length) {
            details.push(...flattenValidationErrors(error.children, field));
        }
    }

    return details;
}

/** `ValidationPipe` exception factory: 400 VALIDATION_ERROR with per-field pt-BR details (BACKEND_SCOPE.md §1). */
export function validationExceptionFactory(errors: ValidationError[]): BadRequestException {
    const payload: ErrorPayload = {
        errorCode: ERROR_CODE.VALIDATION_ERROR,
        details: flattenValidationErrors(errors),
    };

    return new BadRequestException(payload);
}
