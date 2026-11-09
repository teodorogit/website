import { applyDecorators } from '@nestjs/common';
import { IsNotEmpty, IsString } from 'class-validator';
import { TrimTransformer } from '@/common/transformers/trim.transformer';
import { IsMoney } from '@/common/validators/is-money.validator';
import { IsStorableText } from '@/common/validators/is-storable-text.validator';
import { MaxCodePoints } from '@/common/validators/max-code-points.validator';

/** Same limit as the product form and the `products_name_length_check` constraint. */
export const PRODUCT_NAME_MAX_LENGTH = 32;

export const IsProductName = (): PropertyDecorator =>
    applyDecorators(
        TrimTransformer(),
        IsString(),
        IsNotEmpty(),
        IsStorableText(),
        MaxCodePoints(PRODUCT_NAME_MAX_LENGTH),
    );

/** Price: greater than zero (`products_price_cents_check`). */
export const IsProductPrice = (): PropertyDecorator => IsMoney({ exclusiveMin: true });

/** Preparation cost: zero or more (`products_preparation_cost_cents_check`). */
export const IsPreparationCost = (): PropertyDecorator => IsMoney();
