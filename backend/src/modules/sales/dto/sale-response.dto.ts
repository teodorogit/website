import { ApiProperty } from '@nestjs/swagger';
import { CursorPage } from '@/common/pagination/cursor-page';
import { toLocalDate, toLocalTime } from '@/common/utils/date.util';
import { centsToReais } from '@/common/utils/money.util';
import { Sale } from '../entities/sale.entity';

export class SaleResponse {
    @ApiProperty({ format: 'uuid' })
    id!: string;

    @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'null quando o produto foi excluído.' })
    productId!: string | null;

    @ApiProperty({ example: 'Brigadeiro', description: 'Nome do produto no momento da venda.' })
    productName!: string;

    @ApiProperty({ example: 3.0, description: 'Preço unitário no momento da venda, em reais.' })
    unitPrice!: number;

    @ApiProperty({
        example: 1.0,
        description: 'Custo de preparo unitário no momento da venda, em reais. 0 também indica custo não informado.',
    })
    unitCost!: number;

    @ApiProperty({ example: 2 })
    quantity!: number;

    @ApiProperty({ example: 6.0, description: 'unitPrice × quantity, em reais.' })
    total!: number;

    @ApiProperty({ example: 4.0, description: '(unitPrice − unitCost) × quantity, em reais. Pode ser negativo.' })
    profit!: number;

    @ApiProperty({ format: 'date', example: '2026-10-24', description: 'Data local do usuário.' })
    date!: string;

    @ApiProperty({ example: '12:30', description: 'Hora local do usuário (HH:mm).' })
    time!: string;

    static fromEntity(sale: Sale, timeZone: string): SaleResponse {
        return {
            id: sale.id,
            productId: sale.product_id,
            productName: sale.product_name_snapshot,
            unitPrice: centsToReais(sale.unit_price_cents),
            unitCost: centsToReais(sale.unit_cost_cents),
            quantity: sale.quantity,
            // Subtracted and multiplied in cents so the total and the profit carry no float error.
            total: centsToReais(sale.unit_price_cents * sale.quantity),
            profit: centsToReais((sale.unit_price_cents - sale.unit_cost_cents) * sale.quantity),
            date: toLocalDate(sale.occurred_at, timeZone),
            time: toLocalTime(sale.occurred_at, timeZone),
        };
    }
}

export class SaleListResponse {
    @ApiProperty({ type: SaleResponse, isArray: true })
    items!: SaleResponse[];

    @ApiProperty({ type: String, nullable: true, description: 'Cursor da próxima página; null na última.' })
    nextCursor!: string | null;

    static fromPage(page: CursorPage<Sale>, timeZone: string): SaleListResponse {
        return {
            items: page.items.map((sale) => SaleResponse.fromEntity(sale, timeZone)),
            nextCursor: page.nextCursor,
        };
    }
}
