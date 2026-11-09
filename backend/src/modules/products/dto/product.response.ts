import { ApiProperty } from '@nestjs/swagger';
import { centsToReais } from '@/common/utils/money.util';
import { Product } from '../entities/product.entity';

/** API shape of a product: camelCase, money in reais, no `user_id`. */
export class ProductResponse {
    @ApiProperty({ format: 'uuid' })
    id!: string;

    @ApiProperty({ example: 'Brigadeiro' })
    name!: string;

    @ApiProperty({ example: 3.0 })
    price!: number;

    @ApiProperty({ example: 0.0 })
    preparationCost!: number;

    @ApiProperty({ format: 'date-time', example: '2026-10-24T12:00:00.000Z' })
    createdAt!: string;

    @ApiProperty({ format: 'date-time', example: '2026-10-24T12:00:00.000Z' })
    updatedAt!: string;

    static fromEntity(product: Product): ProductResponse {
        return {
            id: product.id,
            name: product.name,
            price: centsToReais(product.price_cents),
            preparationCost: centsToReais(product.preparation_cost_cents),
            createdAt: product.created_at.toISOString(),
            updatedAt: product.updated_at.toISOString(),
        };
    }
}

export class ProductListResponse {
    @ApiProperty({ type: ProductResponse, isArray: true })
    items!: ProductResponse[];

    static fromEntities(products: Product[]): ProductListResponse {
        return { items: products.map((product) => ProductResponse.fromEntity(product)) };
    }
}
