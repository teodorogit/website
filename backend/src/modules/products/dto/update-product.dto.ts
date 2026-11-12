import { IsOmittable } from '@/common/validators/is-omittable.validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { MAX_MONEY_REAIS } from '@/common/utils/money.util';
import { IsPreparationCost, IsProductName, IsProductPrice, PRODUCT_NAME_MAX_LENGTH } from './product-fields';

/**
 * Partial update with the same rules as creation. Written out instead of `PartialType` because
 * that adds `@IsOptional()`, which would accept `null` for required columns.
 */
export class UpdateProductDto {
    @ApiPropertyOptional({ example: 'Brownie', maxLength: PRODUCT_NAME_MAX_LENGTH })
    @IsOmittable()
    @IsProductName()
    name?: string;

    @ApiPropertyOptional({
        example: 9.0,
        minimum: 0.01,
        maximum: MAX_MONEY_REAIS,
        description: 'Não altera o preço de vendas passadas.',
    })
    @IsOmittable()
    @IsProductPrice()
    price?: number;

    @ApiPropertyOptional({
        example: 2.5,
        minimum: 0,
        maximum: MAX_MONEY_REAIS,
        description: 'Não altera o custo nem o lucro de vendas passadas.',
    })
    @IsOmittable()
    @IsPreparationCost()
    preparationCost?: number;
}
