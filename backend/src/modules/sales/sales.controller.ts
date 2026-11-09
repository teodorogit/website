import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import {
    ApiErrorResponse,
    ApiNotFoundErrorResponse,
    ApiUnauthorizedErrorResponse,
    ApiValidationErrorResponse,
} from '@/common/decorators/http/api-error-response.decorator';
import { ERROR_CODE } from '@/common/errors/error-code';
import { UuidParamPipe } from '@/common/pipes/uuid-param.pipe';
import { AuthUser } from '@/modules/auth/auth-user';
import { CreateSaleDto } from './dto/create-sale.dto';
import { ListSalesQuery } from './dto/list-sales-query.dto';
import { SaleListResponse, SaleResponse } from './dto/sale-response.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { SalesService } from './sales.service';

@ApiTags('sales')
@ApiBearerAuth()
@ApiUnauthorizedErrorResponse()
@Controller('sales')
export class SalesController {
    constructor(private readonly salesService: SalesService) {}

    @Get()
    @ApiOkResponse({ type: SaleListResponse })
    @ApiErrorResponse(
        HttpStatus.BAD_REQUEST,
        ERROR_CODE.VALIDATION_ERROR,
        ERROR_CODE.SALE_FILTER_CONFLICT,
        ERROR_CODE.INVALID_DATE_RANGE,
        ERROR_CODE.INVALID_CURSOR,
    )
    async list(@CurrentUser() user: AuthUser, @Query() query: ListSalesQuery): Promise<SaleListResponse> {
        const page = await this.salesService.list(user, query);
        return SaleListResponse.fromPage(page, user.timezone);
    }

    @Post()
    @ApiCreatedResponse({ type: SaleResponse })
    @ApiValidationErrorResponse()
    @ApiNotFoundErrorResponse(ERROR_CODE.PRODUCT_NOT_FOUND)
    async create(@CurrentUser() user: AuthUser, @Body() dto: CreateSaleDto): Promise<SaleResponse> {
        const sale = await this.salesService.create(user, dto);
        return SaleResponse.fromEntity(sale, user.timezone);
    }

    @Patch(':id')
    @ApiOkResponse({ type: SaleResponse })
    @ApiValidationErrorResponse()
    @ApiErrorResponse(HttpStatus.NOT_FOUND, ERROR_CODE.SALE_NOT_FOUND, ERROR_CODE.PRODUCT_NOT_FOUND)
    async update(
        @CurrentUser() user: AuthUser,
        @Param('id', new UuidParamPipe('id')) id: string,
        @Body() dto: UpdateSaleDto,
    ): Promise<SaleResponse> {
        const sale = await this.salesService.update(user, id, dto);
        return SaleResponse.fromEntity(sale, user.timezone);
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiNoContentResponse()
    @ApiValidationErrorResponse()
    @ApiNotFoundErrorResponse(ERROR_CODE.SALE_NOT_FOUND)
    async remove(@CurrentUser() user: AuthUser, @Param('id', new UuidParamPipe('id')) id: string): Promise<void> {
        await this.salesService.remove(user, id);
    }
}
