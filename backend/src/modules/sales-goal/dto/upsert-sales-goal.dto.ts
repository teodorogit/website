import { ApiProperty } from '@nestjs/swagger';
import { MAX_MONEY_REAIS } from '@/common/utils/money.util';
import { IsMoney } from '@/common/validators/is-money.validator';

export class UpsertSalesGoalDto {
    @ApiProperty({
        description: 'Meta em reais: maior que zero, no máximo duas casas decimais.',
        example: 1000.0,
        exclusiveMinimum: true,
        minimum: 0,
        maximum: MAX_MONEY_REAIS,
    })
    @IsMoney({ exclusiveMin: true })
    amount!: number;
}
