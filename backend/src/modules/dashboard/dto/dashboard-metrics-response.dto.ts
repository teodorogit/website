import { ApiProperty } from '@nestjs/swagger';
import { centsToReais } from '@/common/utils/money.util';
import {
    DashboardMetrics,
    MonthlyProfit,
    PeriodTotals,
    ProfitTotals,
    WeekOfMonthSales,
    WeekdaySales,
} from '../entities/dashboard-metrics.entity';
import { ProductSalesTotal } from '../entities/product-sales-total.entity';

const centsToReaisOrNull = (cents: number | null): number | null => (cents === null ? null : centsToReais(cents));

export class MetricsPeriodResponse {
    @ApiProperty({ format: 'date', example: '2026-01-01', description: 'Primeiro dia do período (inclusivo).' })
    startDate!: string;

    @ApiProperty({ format: 'date', example: '2026-12-31', description: 'Último dia do período (inclusivo).' })
    endDate!: string;
}

export class ProfitTotalsResponse {
    @ApiProperty({ example: 318.97, description: 'Faturamento: Σ quantidade × preço unitário histórico, em reais.' })
    revenue!: number;

    @ApiProperty({ example: 80.5, description: 'Custo: Σ quantidade × custo unitário gravado na venda, em reais.' })
    cost!: number;

    @ApiProperty({ example: 238.47, description: 'revenue − cost, em reais. Pode ser negativo.' })
    profit!: number;

    @ApiProperty({
        example: 12,
        description:
            'Parte do faturamento vinda de vendas registradas com custo 0 (custo não informado), em reais. ' +
            'Maior que zero indica lucro superestimado.',
    })
    revenueWithoutCost!: number;

    static fromEntity(totals: ProfitTotals): ProfitTotalsResponse {
        return {
            revenue: centsToReais(totals.revenue_cents),
            cost: centsToReais(totals.cost_cents),
            profit: centsToReais(totals.profit_cents),
            revenueWithoutCost: centsToReais(totals.uncosted_revenue_cents),
        };
    }
}

export class PeriodTotalsResponse extends ProfitTotalsResponse {
    @ApiProperty({ example: 62, description: 'Unidades vendidas.' })
    quantity!: number;

    @ApiProperty({ example: 40, description: 'Registros de venda (cada registro é uma linha de produto).' })
    salesCount!: number;

    @ApiProperty({ example: 18, description: 'Dias do período com pelo menos uma venda.' })
    sellingDays!: number;

    static override fromEntity(totals: PeriodTotals): PeriodTotalsResponse {
        return {
            ...ProfitTotalsResponse.fromEntity(totals),
            quantity: totals.quantity,
            salesCount: totals.sales_count,
            sellingDays: totals.selling_days,
        };
    }
}

export class AverageSalesResponse {
    @ApiProperty({
        type: Number,
        nullable: true,
        example: 17.72,
        description: 'Faturamento ÷ dias com venda (totals.sellingDays), em reais; null sem vendas no período.',
    })
    perSellingDay!: number | null;

    @ApiProperty({
        type: Number,
        nullable: true,
        example: 7.97,
        description: 'Faturamento ÷ registros de venda (totals.salesCount), em reais; null sem vendas no período.',
    })
    perSale!: number | null;
}

export class ProductSalesResponse {
    @ApiProperty({
        type: String,
        format: 'uuid',
        nullable: true,
        description: 'Produto do catálogo por trás da linha; null quando ele não existe mais.',
    })
    productId!: string | null;

    @ApiProperty({
        example: 'Brigadeiro',
        description: 'Nome atual no catálogo; quando productId é null, o nome gravado na venda mais recente.',
    })
    productName!: string;

    @ApiProperty({ example: 40, description: 'Unidades vendidas no período.' })
    quantity!: number;

    @ApiProperty({ example: 120, description: 'Faturamento no período, em reais.' })
    revenue!: number;

    static fromEntity(product: ProductSalesTotal): ProductSalesResponse {
        return {
            productId: product.product_id,
            productName: product.product_name,
            quantity: product.quantity,
            revenue: centsToReais(product.revenue_cents),
        };
    }
}

export class WeekdaySalesResponse {
    @ApiProperty({ example: 6, minimum: 1, maximum: 7, description: 'ISO 8601: 1 = segunda … 7 = domingo.' })
    isoWeekday!: number;

    @ApiProperty({ example: 90, description: 'Faturamento nesse dia da semana, em reais.' })
    revenue!: number;

    @ApiProperty({ example: 20, description: 'Unidades vendidas.' })
    quantity!: number;

    @ApiProperty({ example: 12, description: 'Registros de venda.' })
    salesCount!: number;

    @ApiProperty({
        example: 45,
        description:
            'Quantas vezes esse dia da semana caiu entre o primeiro e o último dia com venda do período ' +
            '(dias sem venda contam).',
    })
    occurrences!: number;

    @ApiProperty({
        type: Number,
        nullable: true,
        example: 2,
        description: 'revenue ÷ occurrences, em reais; null quando occurrences é 0.',
    })
    averageRevenue!: number | null;

    static fromEntity(weekday: WeekdaySales): WeekdaySalesResponse {
        return {
            isoWeekday: weekday.iso_weekday,
            revenue: centsToReais(weekday.revenue_cents),
            quantity: weekday.quantity,
            salesCount: weekday.sales_count,
            occurrences: weekday.occurrences,
            averageRevenue: centsToReaisOrNull(weekday.average_revenue_cents),
        };
    }
}

export class WeekOfMonthSalesResponse {
    @ApiProperty({
        example: 1,
        minimum: 1,
        maximum: 5,
        description: 'Bloco de dias do mês: 1 = dias 1–7, 2 = 8–14, 3 = 15–21, 4 = 22–28, 5 = 29–31.',
    })
    weekOfMonth!: number;

    @ApiProperty({ example: 1, description: 'Primeiro dia do bloco.' })
    startDay!: number;

    @ApiProperty({ example: 7, description: 'Último dia do bloco (31 no bloco 5, qualquer que seja o mês).' })
    endDay!: number;

    @ApiProperty({ example: 120, description: 'Faturamento nesse bloco, em reais.' })
    revenue!: number;

    @ApiProperty({ example: 25, description: 'Unidades vendidas.' })
    quantity!: number;

    @ApiProperty({ example: 15, description: 'Registros de venda.' })
    salesCount!: number;

    @ApiProperty({ example: 10, description: 'Meses do período com pelo menos uma venda nesse bloco.' })
    months!: number;

    @ApiProperty({
        type: Number,
        nullable: true,
        example: 12,
        description: 'revenue ÷ months, em reais; null quando months é 0.',
    })
    averageRevenue!: number | null;

    static fromEntity(week: WeekOfMonthSales): WeekOfMonthSalesResponse {
        return {
            weekOfMonth: week.week_of_month,
            startDay: week.start_day,
            endDay: week.end_day,
            revenue: centsToReais(week.revenue_cents),
            quantity: week.quantity,
            salesCount: week.sales_count,
            months: week.months,
            averageRevenue: centsToReaisOrNull(week.average_revenue_cents),
        };
    }
}

export class MonthlyProfitResponse extends ProfitTotalsResponse {
    @ApiProperty({ example: 1, minimum: 1, maximum: 12, description: '1 = janeiro … 12 = dezembro.' })
    month!: number;

    static override fromEntity(month: MonthlyProfit): MonthlyProfitResponse {
        return { month: month.month, ...ProfitTotalsResponse.fromEntity(month) };
    }
}

export class DashboardMetricsResponse {
    @ApiProperty({ enum: ['BRL'], example: 'BRL' })
    currency!: 'BRL';

    @ApiProperty({ example: 2026, description: 'Ano das métricas (o pedido, ou o atual no fuso do usuário).' })
    year!: number;

    @ApiProperty({ type: Number, nullable: true, example: null, description: 'Mês pedido; null = ano inteiro.' })
    month!: number | null;

    @ApiProperty({ type: MetricsPeriodResponse, description: 'O ano inteiro ou o mês pedido.' })
    period!: MetricsPeriodResponse;

    @ApiProperty({
        type: String,
        format: 'date',
        nullable: true,
        example: '2025-03-14',
        description: 'Data da venda mais antiga do usuário (não se limita ao período); null sem vendas.',
    })
    firstSaleDate!: string | null;

    @ApiProperty({ type: PeriodTotalsResponse, description: 'Totais do período.' })
    totals!: PeriodTotalsResponse;

    @ApiProperty({ type: AverageSalesResponse, description: 'Média de vendas do período.' })
    averageSales!: AverageSalesResponse;

    @ApiProperty({
        type: ProductSalesResponse,
        nullable: true,
        description: 'Produto que mais vendeu no período (o primeiro de topProducts); null sem vendas.',
    })
    bestSellingProduct!: ProductSalesResponse | null;

    @ApiProperty({
        type: ProductSalesResponse,
        isArray: true,
        description: 'Até 5 produtos do período: mais unidades primeiro, depois maior faturamento, depois nome.',
    })
    topProducts!: ProductSalesResponse[];

    @ApiProperty({ type: WeekdaySalesResponse, isArray: true, description: 'Sempre 7 itens, de segunda a domingo.' })
    salesByWeekday!: WeekdaySalesResponse[];

    @ApiProperty({
        type: WeekdaySalesResponse,
        nullable: true,
        description: 'Dia da semana com a maior média (revenue ÷ occurrences); null sem faturamento no período.',
    })
    bestWeekday!: WeekdaySalesResponse | null;

    @ApiProperty({ type: WeekOfMonthSalesResponse, isArray: true, description: 'Sempre 5 itens, do bloco 1 ao 5.' })
    salesByWeekOfMonth!: WeekOfMonthSalesResponse[];

    @ApiProperty({
        type: WeekOfMonthSalesResponse,
        nullable: true,
        description: 'Bloco do mês com a maior média (revenue ÷ months); null sem faturamento no período.',
    })
    bestWeekOfMonth!: WeekOfMonthSalesResponse | null;

    @ApiProperty({
        type: MonthlyProfitResponse,
        isArray: true,
        description: 'Sempre 12 itens, de janeiro a dezembro do ano, mesmo quando month é enviado.',
    })
    monthlyProfit!: MonthlyProfitResponse[];

    @ApiProperty({ type: ProfitTotalsResponse, description: 'Soma dos 12 meses do ano.' })
    annualProfit!: ProfitTotalsResponse;

    static fromEntity(metrics: DashboardMetrics): DashboardMetricsResponse {
        const topProducts = metrics.top_products.map((product) => ProductSalesResponse.fromEntity(product));

        return {
            currency: 'BRL',
            year: metrics.year,
            month: metrics.month,
            period: { startDate: metrics.period_start, endDate: metrics.period_end },
            firstSaleDate: metrics.first_sale_date,
            totals: PeriodTotalsResponse.fromEntity(metrics.totals),
            averageSales: {
                perSellingDay: centsToReaisOrNull(metrics.average_per_selling_day_cents),
                perSale: centsToReaisOrNull(metrics.average_per_sale_cents),
            },
            bestSellingProduct: topProducts[0] ?? null,
            topProducts,
            salesByWeekday: metrics.sales_by_weekday.map((weekday) => WeekdaySalesResponse.fromEntity(weekday)),
            bestWeekday: metrics.best_weekday ? WeekdaySalesResponse.fromEntity(metrics.best_weekday) : null,
            salesByWeekOfMonth: metrics.sales_by_week_of_month.map((week) => WeekOfMonthSalesResponse.fromEntity(week)),
            bestWeekOfMonth: metrics.best_week_of_month
                ? WeekOfMonthSalesResponse.fromEntity(metrics.best_week_of_month)
                : null,
            monthlyProfit: metrics.monthly_profit.map((month) => MonthlyProfitResponse.fromEntity(month)),
            annualProfit: ProfitTotalsResponse.fromEntity(metrics.annual_profit),
        };
    }
}
