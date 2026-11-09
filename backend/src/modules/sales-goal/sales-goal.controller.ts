import { Body, Controller, Get, HttpCode, HttpStatus, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import {
    ApiUnauthorizedErrorResponse,
    ApiValidationErrorResponse,
} from '@/common/decorators/http/api-error-response.decorator';
import { AuthUser } from '@/modules/auth/auth-user';
import { SalesGoalResponseDto } from './dto/sales-goal-response.dto';
import { UpsertSalesGoalDto } from './dto/upsert-sales-goal.dto';
import { SalesGoalService } from './sales-goal.service';

@ApiTags('sales-goal')
@ApiBearerAuth()
@ApiUnauthorizedErrorResponse()
@Controller('sales-goal')
export class SalesGoalController {
    constructor(private readonly salesGoalService: SalesGoalService) {}

    @Get()
    @ApiOkResponse({ type: SalesGoalResponseDto })
    async find(@CurrentUser() user: AuthUser): Promise<SalesGoalResponseDto> {
        return SalesGoalResponseDto.fromEntity(await this.salesGoalService.findByUser(user));
    }

    @Put()
    @HttpCode(HttpStatus.OK)
    @ApiOkResponse({ type: SalesGoalResponseDto })
    @ApiValidationErrorResponse()
    async upsert(@CurrentUser() user: AuthUser, @Body() dto: UpsertSalesGoalDto): Promise<SalesGoalResponseDto> {
        return SalesGoalResponseDto.fromEntity(await this.salesGoalService.upsert(user, dto));
    }
}
