import { ApiProperty } from '@nestjs/swagger';
import { centsToReais } from '@/common/utils/money.util';
import { DashboardSummary } from '../entities/dashboard-summary.entity';
import { WeeklySalesTotal } from '../entities/weekly-sales-total.entity';

export class WeeklySalesResponse {
    @ApiProperty({ example: '2026-09-07', description: 'Segunda-feira da semana (fuso do usuário).' })
    weekStart!: string;

    @ApiProperty({ example: '2026-09-13', description: 'Domingo da mesma semana.' })
    weekEnd!: string;

    @ApiProperty({ example: 120.0, description: 'Faturamento da semana em reais.' })
    total!: number;

    static fromEntity(week: WeeklySalesTotal): WeeklySalesResponse {
        return { weekStart: week.week_start, weekEnd: week.week_end, total: centsToReais(week.total_cents) };
    }
}

export class DashboardResponse {
    @ApiProperty({ enum: ['BRL'], example: 'BRL' })
    currency!: 'BRL';

    @ApiProperty({ type: Number, nullable: true, example: 1000.0, description: 'Meta em reais; null sem meta.' })
    salesGoal!: number | null;

    @ApiProperty({ example: 450.0, description: 'Soma de todas as vendas do usuário, em reais.' })
    sold!: number;

    @ApiProperty({ example: 550.0, description: 'max(0, meta − vendido); 0 sem meta.' })
    remaining!: number;

    @ApiProperty({ type: WeeklySalesResponse, isArray: true, description: 'Semana mais antiga primeiro.' })
    weeklySales!: WeeklySalesResponse[];

    @ApiProperty({ type: WeeklySalesResponse, nullable: true, description: 'null quando não há vendas no período.' })
    bestWeek!: WeeklySalesResponse | null;

    static fromEntity(summary: DashboardSummary): DashboardResponse {
        return {
            currency: 'BRL',
            salesGoal: summary.sales_goal_cents === null ? null : centsToReais(summary.sales_goal_cents),
            sold: centsToReais(summary.sold_cents),
            remaining: centsToReais(summary.remaining_cents),
            weeklySales: summary.weekly_sales.map((week) => WeeklySalesResponse.fromEntity(week)),
            bestWeek: summary.best_week ? WeeklySalesResponse.fromEntity(summary.best_week) : null,
        };
    }
}
