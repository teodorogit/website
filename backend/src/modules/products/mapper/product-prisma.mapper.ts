import { Injectable } from '@nestjs/common';
import { Product as ProductPrisma } from '@prisma/client';
import { Mapper } from '@/common/mapper/mapper';
import { Product } from '../entities/product.entity';

export const PRODUCT_MAPPER = 'ProductMapper';

@Injectable()
export class ProductPrismaMapper implements Mapper<ProductPrisma, Product> {
    mapFromEntity(product: Product): ProductPrisma {
        return {
            id: product.id,
            user_id: product.user_id,
            name: product.name,
            price_cents: product.price_cents,
            preparation_cost_cents: product.preparation_cost_cents,
            created_at: product.created_at,
            updated_at: product.updated_at,
        };
    }

    mapToEntity(row: ProductPrisma): Product {
        return new Product({
            id: row.id,
            user_id: row.user_id,
            name: row.name,
            price_cents: row.price_cents,
            preparation_cost_cents: row.preparation_cost_cents,
            created_at: row.created_at,
            updated_at: row.updated_at,
        });
    }
}
