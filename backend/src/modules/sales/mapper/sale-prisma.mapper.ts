import { Injectable } from '@nestjs/common';
import { Sale as SalePrisma } from '@prisma/client';
import { Mapper } from '@/common/mapper/mapper';
import { Sale } from '../entities/sale.entity';

export const SALE_MAPPER = 'SaleMapper';

@Injectable()
export class SalePrismaMapper implements Mapper<SalePrisma, Sale> {
    mapFromEntity(sale: Sale): SalePrisma {
        return {
            id: sale.id,
            user_id: sale.user_id,
            product_id: sale.product_id,
            product_name_snapshot: sale.product_name_snapshot,
            unit_price_cents: sale.unit_price_cents,
            unit_cost_cents: sale.unit_cost_cents,
            quantity: sale.quantity,
            occurred_at: sale.occurred_at,
            created_at: sale.created_at,
            updated_at: sale.updated_at,
        };
    }

    mapToEntity(row: SalePrisma): Sale {
        return new Sale({
            id: row.id,
            user_id: row.user_id,
            product_id: row.product_id,
            product_name_snapshot: row.product_name_snapshot,
            unit_price_cents: row.unit_price_cents,
            unit_cost_cents: row.unit_cost_cents,
            quantity: row.quantity,
            occurred_at: row.occurred_at,
            created_at: row.created_at,
            updated_at: row.updated_at,
        });
    }
}
