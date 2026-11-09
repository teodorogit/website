import { ValidationOptions, registerDecorator } from 'class-validator';
import { isCalendarDate } from '../utils/date.util';

/** `YYYY-MM-DD` that is a real calendar date (BACKEND_SCOPE.md §4: "datas ISO reais"). */
export function IsCalendarDate(options?: ValidationOptions): PropertyDecorator {
    return (target: object, propertyName: string | symbol) => {
        registerDecorator({
            name: 'isCalendarDate',
            target: target.constructor,
            propertyName: propertyName.toString(),
            options: {
                message: 'Deve ser uma data válida no formato AAAA-MM-DD.',
                ...options,
            },
            validator: {
                validate: (value: unknown) => isCalendarDate(value),
            },
        });
    };
}
