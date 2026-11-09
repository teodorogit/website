import { Injectable } from '@nestjs/common';
import { Mapper } from '@/common/mapper/mapper';
import { aggregateToCents } from '@/common/utils/money.util';
import { WeeklySalesTotal } from '../entities/weekly-sales-total.entity';

export const DASHBOARD_MAPPER = 'DashboardMapper';

/** Row of the weekly aggregate query: the local Monday as text and `SUM(...)::bigint`. */
export type WeeklySalesRow = {
    week_start: string;
    total_cents: bigint;
};

@Injectable()
export class DashboardPrismaMapper implements Mapper<WeeklySalesRow, WeeklySalesTotal> {
    mapFromEntity(week: WeeklySalesTotal): WeeklySalesRow {
        return { week_start: week.week_start, total_cents: BigInt(week.total_cents) };
    }

    mapToEntity(row: WeeklySalesRow): WeeklySalesTotal {
        return new WeeklySalesTotal({ week_start: row.week_start, total_cents: aggregateToCents(row.total_cents) });
    }
}
