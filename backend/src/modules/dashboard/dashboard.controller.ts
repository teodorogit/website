import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { API_KEY_SECURITY_NAME, AllowApiKey } from '@/common/decorators/allow-api-key.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import {
    ApiUnauthorizedErrorResponse,
    ApiValidationErrorResponse,
} from '@/common/decorators/http/api-error-response.decorator';
import { AuthUser } from '@/modules/auth/auth-user';
import { DashboardService } from './dashboard.service';
import { DashboardMetricsResponse } from './dto/dashboard-metrics-response.dto';
import { DashboardResponse } from './dto/dashboard-response.dto';
import { GetDashboardMetricsQueryDto } from './dto/get-dashboard-metrics-query.dto';
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

    @Get('metrics')
    // Read-only, so it can also be pulled by Power BI with the X-Api-Key header.
    @AllowApiKey()
    @ApiSecurity(API_KEY_SECURITY_NAME)
    @ApiOkResponse({ type: DashboardMetricsResponse })
    @ApiValidationErrorResponse()
    async getMetrics(
        @Query() query: GetDashboardMetricsQueryDto,
        @CurrentUser() user: AuthUser,
    ): Promise<DashboardMetricsResponse> {
        return DashboardMetricsResponse.fromEntity(
            await this.dashboardService.getMetrics(user, { year: query.year, month: query.month }),
        );
    }
}
