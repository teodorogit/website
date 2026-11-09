import { ApiProperty } from '@nestjs/swagger';
import { centsToReais } from '@/common/utils/money.util';
import { SalesGoal } from '../entities/sales-goal.entity';

export class SalesGoalResponseDto {
    @ApiProperty({
        type: Number,
        nullable: true,
        example: 1000.0,
        description: 'Meta em reais; null quando não há meta.',
    })
    amount!: number | null;

    @ApiProperty({ type: String, format: 'date-time', nullable: true, example: '2026-10-24T12:00:00.000Z' })
    updatedAt!: string | null;

    /** No goal yet is a 200 with nulls, not a 404 (BACKEND_SCOPE.md §2, Home). */
    static fromEntity(goal: SalesGoal | null): SalesGoalResponseDto {
        return {
            amount: goal ? centsToReais(goal.amount_cents) : null,
            updatedAt: goal ? goal.updated_at.toISOString() : null,
        };
    }
}
