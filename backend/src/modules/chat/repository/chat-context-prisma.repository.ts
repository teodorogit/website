import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UserScope } from '@/common/repository/repository';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import {
    CatalogProduct,
    InstantRange,
    ProductSalesSummary,
    RecentSale,
    SalesWindows,
} from '../entities/chat-context.entity';
import { ChatContextPrismaMapper, ProductSalesSummaryRow } from '../mapper/chat-context-prisma.mapper';
import { ChatContextRepository } from './chat-context.repository';

function inRange(range: InstantRange): Prisma.Sql {
    return Prisma.sql`occurred_at >= ${range.start}::timestamptz AND occurred_at < ${range.end}::timestamptz`;
}

@Injectable()
export class ChatContextPrismaRepository implements ChatContextRepository {
    constructor(
        private readonly prismaService: PrismaService,
        private readonly mapper: ChatContextPrismaMapper,
    ) {}

    async listProducts(scope: UserScope): Promise<CatalogProduct[]> {
        const rows = await this.prismaService.product.findMany({
            where: { user_id: scope.user_id },
            orderBy: [{ name: 'asc' }, { id: 'asc' }],
            select: { id: true, name: true, price_cents: true, preparation_cost_cents: true, updated_at: true },
        });

        return rows.map((row) => this.mapper.mapProductToEntity(row));
    }

    /**
     * One pass over the user's sales: products still in the catalog are grouped by id (so a rename keeps
     * their history together); sales of deleted products (`product_id IS NULL`) are grouped by the name snapshot.
     * `unit_price_cents::bigint` keeps the multiplication from overflowing a Postgres integer.
     */
    async summarizeSalesByProduct(scope: UserScope, windows: SalesWindows): Promise<ProductSalesSummary[]> {
        const rows = await this.prismaService.$queryRaw<ProductSalesSummaryRow[]>(Prisma.sql`
            SELECT
                product_id,
                CASE WHEN product_id IS NULL THEN product_name_snapshot END AS removed_product_name,
                COUNT(*) AS sales_count,
                SUM(quantity) AS units,
                SUM(unit_price_cents::bigint * quantity) AS revenue_cents,
                COUNT(*) FILTER (WHERE ${inRange(windows.last_30_days)}) AS sales_count_30d,
                SUM(quantity) FILTER (WHERE ${inRange(windows.last_30_days)}) AS units_30d,
                SUM(unit_price_cents::bigint * quantity) FILTER (WHERE ${inRange(windows.last_30_days)}) AS revenue_cents_30d,
                COUNT(*) FILTER (WHERE ${inRange(windows.last_7_days)}) AS sales_count_7d,
                SUM(quantity) FILTER (WHERE ${inRange(windows.last_7_days)}) AS units_7d,
                SUM(unit_price_cents::bigint * quantity) FILTER (WHERE ${inRange(windows.last_7_days)}) AS revenue_cents_7d,
                COUNT(*) FILTER (WHERE ${inRange(windows.today)}) AS sales_count_today,
                SUM(quantity) FILTER (WHERE ${inRange(windows.today)}) AS units_today,
                SUM(unit_price_cents::bigint * quantity) FILTER (WHERE ${inRange(windows.today)}) AS revenue_cents_today,
                MIN(occurred_at) AS first_sale_at,
                MAX(occurred_at) AS last_sale_at
            FROM sales
            WHERE user_id = ${scope.user_id}::uuid
            GROUP BY product_id, removed_product_name
        `);

        return rows.map((row) => this.mapper.mapSalesSummaryToEntity(row));
    }

    async listRecentSales(scope: UserScope, limit: number): Promise<RecentSale[]> {
        const rows = await this.prismaService.sale.findMany({
            where: { user_id: scope.user_id },
            orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }],
            take: limit,
            select: { product_name_snapshot: true, unit_price_cents: true, quantity: true, occurred_at: true },
        });

        return rows.map((row) => this.mapper.mapRecentSaleToEntity(row));
    }

    async findSalesGoalCents(scope: UserScope): Promise<number | null> {
        const goal = await this.prismaService.salesGoal.findUnique({
            where: { user_id: scope.user_id },
            select: { amount_cents: true },
        });

        return goal?.amount_cents ?? null;
    }
}
