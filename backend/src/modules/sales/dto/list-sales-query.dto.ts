import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import { CursorPaginationQuery } from '@/common/pagination/cursor-page';
import { IsCalendarDate } from '@/common/validators/is-calendar-date.validator';

/**
 * `date` (Home: one local day) or `startDate`/`endDate` (Vendas: inclusive, either bound alone),
 * or neither (every sale). Mixing the two modes is rejected by the service.
 */
export class ListSalesQuery extends CursorPaginationQuery {
    @ApiPropertyOptional({ format: 'date', example: '2026-10-24', description: 'Dia local do usuário.' })
    @IsOptional()
    @IsCalendarDate()
    date?: string;

    @ApiPropertyOptional({ format: 'date', example: '2026-10-01', description: 'Inclusiva.' })
    @IsOptional()
    @IsCalendarDate()
    startDate?: string;

    @ApiPropertyOptional({ format: 'date', example: '2026-10-31', description: 'Inclusiva.' })
    @IsOptional()
    @IsCalendarDate()
    endDate?: string;
}
