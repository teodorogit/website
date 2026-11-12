import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UserScope } from '@/common/repository/repository';
import { aggregateToCents } from '@/common/utils/money.util';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { DailySalesTotal } from '../entities/daily-sales-total.entity';
import { ProductSalesTotal } from '../entities/product-sales-total.entity';
import { WeeklySalesTotal } from '../entities/weekly-sales-total.entity';
import {
    DailySalesRow,
    DashboardPrismaMapper,
    ProductSalesRow,
    WeeklySalesRow,
} from '../mapper/dashboard-prisma.mapper';
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

    async sumDailySales(
        scope: UserScope,
        range: { start: Date; end: Date },
        timeZone: string,
    ): Promise<DailySalesTotal[]> {
        // The FILTERed sum is NULL on a day whose sales all carry a cost, hence the COALESCE.
        const rows = await this.prismaService.$queryRaw<DailySalesRow[]>(Prisma.sql`
            SELECT
                to_char(s.occurred_at AT TIME ZONE ${timeZone}, 'YYYY-MM-DD') AS day,
                SUM(s.unit_price_cents::bigint * s.quantity)::bigint AS revenue_cents,
                SUM(s.unit_cost_cents::bigint * s.quantity)::bigint AS cost_cents,
                COALESCE(
                    SUM(s.unit_price_cents::bigint * s.quantity) FILTER (WHERE s.unit_cost_cents = 0),
                    0
                )::bigint AS uncosted_revenue_cents,
                SUM(s.quantity)::bigint AS quantity,
                COUNT(*)::bigint AS sales_count
            FROM sales s
            WHERE s.user_id = ${scope.user_id}::uuid
              AND s.occurred_at >= ${range.start}::timestamptz
              AND s.occurred_at < ${range.end}::timestamptz
            GROUP BY 1
            ORDER BY 1
        `);

        return rows.map((row) => this.dashboardMapper.mapDailySalesToEntity(row));
    }

    async findTopProducts(
        scope: UserScope,
        range: { start: Date; end: Date },
        limit: number,
    ): Promise<ProductSalesTotal[]> {
        // A product is its resolved name: the current catalog name while the sale still points to a
        // product (so a rename keeps one row), else the snapshot. `lower()` folds case the way the
        // citext unique index does, so at most one catalog product can be behind a group and MAX()
        // just picks it. The join repeats user_id so a product of another user can never match.
        const rows = await this.prismaService.$queryRaw<ProductSalesRow[]>(Prisma.sql`
            SELECT
                MAX(p.id::text) AS product_id,
                COALESCE(
                    MAX(p.name::text),
                    (array_agg(s.product_name_snapshot ORDER BY s.occurred_at DESC, s.id DESC))[1]
                ) AS product_name,
                SUM(s.quantity)::bigint AS quantity,
                SUM(s.unit_price_cents::bigint * s.quantity)::bigint AS revenue_cents
            FROM sales s
            LEFT JOIN products p ON p.id = s.product_id AND p.user_id = s.user_id
            WHERE s.user_id = ${scope.user_id}::uuid
              AND s.occurred_at >= ${range.start}::timestamptz
              AND s.occurred_at < ${range.end}::timestamptz
            GROUP BY lower(COALESCE(p.name::text, s.product_name_snapshot))
            ORDER BY 3 DESC, 4 DESC, lower(COALESCE(p.name::text, s.product_name_snapshot)) ASC
            LIMIT ${limit}
        `);

        return rows.map((row) => this.dashboardMapper.mapProductSalesToEntity(row));
    }

    async findFirstSaleAt(scope: UserScope): Promise<Date | null> {
        const sale = await this.prismaService.sale.findFirst({
            where: { user_id: scope.user_id },
            orderBy: { occurred_at: 'asc' },
            select: { occurred_at: true },
        });

        return sale?.occurred_at ?? null;
    }
}
