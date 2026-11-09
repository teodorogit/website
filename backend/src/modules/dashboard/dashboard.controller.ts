import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import {
    ApiUnauthorizedErrorResponse,
    ApiValidationErrorResponse,
} from '@/common/decorators/http/api-error-response.decorator';
import { AuthUser } from '@/modules/auth/auth-user';
import { DashboardService } from './dashboard.service';
import { DashboardResponse } from './dto/dashboard-response.dto';
import { GetDashboardQueryDto } from './dto/get-dashboard-query.dto';

@ApiTags('dashboard')
@ApiBearerAuth()
@ApiUnauthorizedErrorResponse()
@Controller('dashboard')
export class DashboardController {
    constructor(private readonly dashboardService: DashboardService) {}

    @Get()
    @ApiOkResponse({ type: DashboardResponse })
    @ApiValidationErrorResponse()
    async getDashboard(
        @Query() query: GetDashboardQueryDto,
        @CurrentUser() user: AuthUser,
    ): Promise<DashboardResponse> {
        return DashboardResponse.fromEntity(await this.dashboardService.getDashboard(user, query.weeks));
    }
}
