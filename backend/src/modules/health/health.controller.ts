import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Public } from '@/common/decorators/public.decorator';

export class HealthResponse {
    @ApiProperty({ example: 'ok' })
    status!: 'ok';
}

/** Liveness only: no env vars, versions, hosts or dependency details (BACKEND_SCOPE.md §2 "Saúde do serviço"). */
@ApiTags('health')
@Controller('health')
export class HealthController {
    @Get()
    @Public()
    @ApiOkResponse({ type: HealthResponse })
    check(): HealthResponse {
        return { status: 'ok' };
    }
}
