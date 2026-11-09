import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const DEFAULT_DASHBOARD_WEEKS = 8;
export const MIN_DASHBOARD_WEEKS = 1;
export const MAX_DASHBOARD_WEEKS = 52;

export class GetDashboardQueryDto {
    @ApiPropertyOptional({
        description: 'Quantidade de semanas da série semanal (a última é a semana atual).',
        minimum: MIN_DASHBOARD_WEEKS,
        maximum: MAX_DASHBOARD_WEEKS,
        default: DEFAULT_DASHBOARD_WEEKS,
        example: DEFAULT_DASHBOARD_WEEKS,
    })
    @IsOptional()
    @Type(() => Number)
    @Min(MIN_DASHBOARD_WEEKS)
    @Max(MAX_DASHBOARD_WEEKS)
    // Lowest decorator is reported first: `weeks=abc` (NaN) fails all three, and "not an integer" is the useful message.
    @IsInt()
    weeks: number = DEFAULT_DASHBOARD_WEEKS;
}
