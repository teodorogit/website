import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { MAX_CALENDAR_YEAR } from '@/common/utils/date.util';

/** Sales dated before this year still show in `GET /api/sales` and in `sold`, never in the metrics. */
export const MIN_METRICS_YEAR = 2000;
export const MAX_METRICS_YEAR = MAX_CALENDAR_YEAR;

/**
 * Neither field has a default here, unlike `weeks`: the default year is the current year in the
 * user's timezone, which only the service knows.
 */
export class GetDashboardMetricsQueryDto {
    @ApiPropertyOptional({
        description: 'Ano das métricas. Padrão: o ano atual no fuso horário do usuário.',
        minimum: MIN_METRICS_YEAR,
        maximum: MAX_METRICS_YEAR,
        example: 2026,
    })
    @IsOptional()
    @Type(() => Number)
    @Min(MIN_METRICS_YEAR)
    @Max(MAX_METRICS_YEAR)
    // Lowest decorator is reported first: `year=abc` (NaN) fails all three, and "not an integer" is the useful message.
    @IsInt()
    year?: number;

    @ApiPropertyOptional({
        description:
            'Mês (1 a 12) do ano escolhido. Sem ele o período é o ano inteiro. ' +
            'A série de lucro mensal cobre sempre o ano inteiro.',
        minimum: 1,
        maximum: 12,
        example: 11,
    })
    @IsOptional()
    @Type(() => Number)
    @Min(1)
    @Max(12)
    @IsInt()
    month?: number;
}
