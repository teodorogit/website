import { Type, plainToInstance } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsString, MaxLength, Min, ValidateNested, validateSync } from 'class-validator';
import { IsCalendarDate } from '@/common/validators/is-calendar-date.validator';
import { IsMoney } from '@/common/validators/is-money.validator';
import { flattenValidationErrors, validationExceptionFactory } from '../validation-exception.factory';

class ItemDto {
    @IsString()
    @MaxLength(5)
    content!: string;
}

class SampleDto {
    @IsInt()
    @Min(1)
    quantity!: number;

    @IsMoney({ exclusiveMin: true })
    price!: number;

    @IsCalendarDate()
    date!: string;

    @IsArray()
    @ArrayMaxSize(2)
    @ValidateNested({ each: true })
    @Type(() => ItemDto)
    items!: ItemDto[];
}

function validate(plain: object) {
    return validateSync(plainToInstance(SampleDto, plain));
}

describe('validationExceptionFactory', () => {
    it('produces 400 VALIDATION_ERROR with translated, dotted-path details', () => {
        const errors = validate({
            quantity: 0,
            price: 1.234,
            date: '2026-02-30',
            items: [{ content: 'ok' }, { content: 'too long' }],
        });

        const exception = validationExceptionFactory(errors);

        expect(exception.getStatus()).toBe(400);
        expect(exception.getResponse()).toEqual({
            errorCode: 'VALIDATION_ERROR',
            details: [
                { field: 'quantity', message: 'Deve ser maior ou igual a 1.' },
                { field: 'price', message: 'Deve ser um valor numérico com no máximo duas casas decimais.' },
                { field: 'date', message: 'Deve ser uma data válida no formato AAAA-MM-DD.' },
                { field: 'items.1.content', message: 'Deve ter no máximo 5 caracteres.' },
            ],
        });
    });

    it('enforces "greater than zero" money with two decimals', () => {
        const details = flattenValidationErrors(validate({ quantity: 1, price: 0, date: '2026-10-24', items: [] }));
        expect(details).toEqual([{ field: 'price', message: 'Deve ser maior que 0.' }]);
    });

    it('translates array size limits', () => {
        const details = flattenValidationErrors(
            validate({
                quantity: 1,
                price: 1,
                date: '2026-10-24',
                items: [{ content: 'a' }, { content: 'b' }, { content: 'c' }],
            }),
        );
        expect(details).toEqual([{ field: 'items', message: 'Deve ter no máximo 2 itens.' }]);
    });
});
