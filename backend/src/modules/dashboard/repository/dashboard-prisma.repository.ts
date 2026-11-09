import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UserScope } from '@/common/repository/repository';
import { aggregateToCents } from '@/common/utils/money.util';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { WeeklySalesTotal } from '../entities/weekly-sales-total.entity';
import { DashboardPrismaMapper, WeeklySalesRow } from '../mapper/dashboard-prisma.mapper';
import { DashboardRepository } from './dashboard.repository';

/*
 * Raw SQL notes:
 * - Prisma binds JS strings as text, so `user_id` is cast to uuid and the instants to timestamptz.
 * - `unit_price_cents::bigint * quantity` keeps the per-sale product out of int4 overflow; SUM(int8)
 *   yields numeric, cast back to bigint (aggregateToCents rejects anything beyond a safe integer).
 * - `occurred_at AT TIME ZONE tz` gives the local wall-clock timestamp; Postgres weeks start on Monday,
 *   so `date_trunc('week', …)` is the local Monday, formatted as text to never round-trip through a JS Date.
 */
@Injectable()
export class DashboardPrismaRepository implements DashboardRepository {
    constructor(
        private readonly prismaService: PrismaService,
        private readonly dashboardMapper: DashboardPrismaMapper,
    ) {}

    async findSalesGoalCents(scope: UserScope): Promise<number | null> {
        const goal = await this.prismaService.salesGoal.findUnique({
            where: { user_id: scope.user_id },
            select: { amount_cents: true },
        });

        return goal?.amount_cents ?? null;
    }

    async sumSoldCents(scope: UserScope): Promise<number> {
        const [row] = await this.prismaService.$queryRaw<{ total_cents: bigint }[]>(Prisma.sql`
            SELECT COALESCE(SUM(s.unit_price_cents::bigint * s.quantity), 0)::bigint AS total_cents
            FROM sales s
            WHERE s.user_id = ${scope.user_id}::uuid
        `);

        return aggregateToCents(row?.total_cents);
    }

    async sumWeeklySalesCents(
        scope: UserScope,
        range: { start: Date; end: Date },
        timeZone: string,
    ): Promise<WeeklySalesTotal[]> {
        const rows = await this.prismaService.$queryRaw<WeeklySalesRow[]>(Prisma.sql`
            SELECT
                to_char(date_trunc('week', s.occurred_at AT TIME ZONE ${timeZone}), 'YYYY-MM-DD') AS week_start,
                SUM(s.unit_price_cents::bigint * s.quantity)::bigint AS total_cents
            FROM sales s
            WHERE s.user_id = ${scope.user_id}::uuid
              AND s.occurred_at >= ${range.start}::timestamptz
              AND s.occurred_at < ${range.end}::timestamptz
            GROUP BY 1
            ORDER BY 1
        `);

        return rows.map((row) => this.dashboardMapper.mapToEntity(row));
    }
}
