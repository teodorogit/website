import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsUUID, Max, Min } from 'class-validator';
import { IsOmittable } from '@/common/validators/is-omittable.validator';
import { MAX_SALE_QUANTITY } from '@/common/utils/money.util';
import { IsCalendarDate } from '@/common/validators/is-calendar-date.validator';

/**
 * Partial edit. `productId` can't be null: a sale only loses its product link when the product
 * itself is deleted (BACKEND_SCOPE.md §2 "PATCH /api/sales/:id").
 */
export class UpdateSaleDto {
    @ApiPropertyOptional({ format: 'uuid' })
    @IsOmittable()
    @IsUUID()
    productId?: string;

    @ApiPropertyOptional({ minimum: 1, maximum: MAX_SALE_QUANTITY, example: 3 })
    @IsOmittable()
    @Max(MAX_SALE_QUANTITY)
    @Min(1, { message: 'Deve ser maior que zero.' })
    @IsInt()
    quantity?: number;

    @ApiPropertyOptional({ format: 'date', example: '2026-10-23' })
    @IsOmittable()
    @IsCalendarDate()
    date?: string;
}
