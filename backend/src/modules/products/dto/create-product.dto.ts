import { IsOmittable } from '@/common/validators/is-omittable.validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MAX_MONEY_REAIS } from '@/common/utils/money.util';
import { IsPreparationCost, IsProductName, IsProductPrice, PRODUCT_NAME_MAX_LENGTH } from './product-fields';

export class CreateProductDto {
    @ApiProperty({
        example: 'Brownie',
        maxLength: PRODUCT_NAME_MAX_LENGTH,
        description: 'Único por usuário, sem diferenciar maiúsculas.',
    })
    @IsProductName()
    name!: string;

    @ApiProperty({
        example: 8.0,
        minimum: 0.01,
        maximum: MAX_MONEY_REAIS,
        description: 'Preço em reais, até 2 casas decimais.',
    })
    @IsProductPrice()
    price!: number;

    @ApiPropertyOptional({
        example: 2.5,
        minimum: 0,
        maximum: MAX_MONEY_REAIS,
        default: 0,
        description: 'Custo de preparo em reais.',
    })
    @IsOmittable()
    @IsPreparationCost()
    preparationCost?: number;
}
