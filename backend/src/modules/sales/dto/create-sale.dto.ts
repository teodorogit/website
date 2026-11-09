import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsInt, IsUUID, Max, Min } from 'class-validator';
import { MAX_SALE_QUANTITY } from '@/common/utils/money.util';
import { IsCalendarDate } from '@/common/validators/is-calendar-date.validator';

/**
 * Name and price are deliberately absent: they are snapshotted from the user's catalog
 * (BACKEND_SCOPE.md §2 "POST /api/sales"), and the global pipe rejects them as unknown fields.
 *
 * class-validator reports constraints bottom-up and the error factory keeps the first one,
 * so the type check sits closest to the property.
 */
export class CreateSaleDto {
    @ApiProperty({ format: 'uuid' })
    @IsDefined()
    @IsUUID()
    productId!: string;

    @ApiProperty({ minimum: 1, maximum: MAX_SALE_QUANTITY, example: 2 })
    @IsDefined()
    @Max(MAX_SALE_QUANTITY)
    @Min(1, { message: 'Deve ser maior que zero.' })
    @IsInt()
    quantity!: number;

    @ApiProperty({ format: 'date', example: '2026-10-24' })
    @IsDefined()
    @IsCalendarDate()
    date!: string;
}
