import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import {
    ApiConflictErrorResponse,
    ApiErrorResponse,
    ApiNotFoundErrorResponse,
    ApiUnauthorizedErrorResponse,
    ApiValidationErrorResponse,
} from '@/common/decorators/http/api-error-response.decorator';
import { ERROR_CODE } from '@/common/errors/error-code';
import { UuidParamPipe } from '@/common/pipes/uuid-param.pipe';
import { AuthUser } from '@/modules/auth/auth-user';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductListResponse, ProductResponse } from './dto/product.response';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

@ApiTags('products')
@ApiBearerAuth()
@ApiUnauthorizedErrorResponse()
@Controller('products')
export class ProductsController {
    constructor(private readonly productsService: ProductsService) {}

    @Get()
    @ApiOkResponse({ type: ProductListResponse, description: 'Produtos do usuário, ordenados pelo nome.' })
    async findAll(@CurrentUser() user: AuthUser): Promise<ProductListResponse> {
        return ProductListResponse.fromEntities(await this.productsService.findAll(user));
    }

    @Post()
    @ApiCreatedResponse({ type: ProductResponse })
    @ApiValidationErrorResponse()
    @ApiErrorResponse(HttpStatus.CONFLICT, ERROR_CODE.PRODUCT_NAME_CONFLICT, ERROR_CODE.PRODUCT_LIMIT_REACHED)
    async create(@CurrentUser() user: AuthUser, @Body() dto: CreateProductDto): Promise<ProductResponse> {
        return ProductResponse.fromEntity(await this.productsService.create(user, dto));
    }

    @Patch(':id')
    @ApiOkResponse({ type: ProductResponse })
    @ApiValidationErrorResponse()
    @ApiNotFoundErrorResponse(ERROR_CODE.PRODUCT_NOT_FOUND)
    @ApiConflictErrorResponse(ERROR_CODE.PRODUCT_NAME_CONFLICT)
    async update(
        @CurrentUser() user: AuthUser,
        @Param('id', new UuidParamPipe('id')) id: string,
        @Body() dto: UpdateProductDto,
    ): Promise<ProductResponse> {
        return ProductResponse.fromEntity(await this.productsService.update(user, id, dto));
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiNoContentResponse({ description: 'Produto removido; as vendas mantêm o snapshot de nome, preço e custo.' })
    @ApiValidationErrorResponse()
    @ApiNotFoundErrorResponse(ERROR_CODE.PRODUCT_NOT_FOUND)
    async remove(@CurrentUser() user: AuthUser, @Param('id', new UuidParamPipe('id')) id: string): Promise<void> {
        await this.productsService.remove(user, id);
    }
}
