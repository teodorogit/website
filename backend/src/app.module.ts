import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EnvConfigModule } from './common/env-config/env-config.module';
import { validate } from './config/configuration';
import { AuthModule } from './modules/auth/auth.module';
import { ChatModule } from './modules/chat/chat.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { HealthModule } from './modules/health/health.module';
import { ProductsModule } from './modules/products/products.module';
import { SalesGoalModule } from './modules/sales-goal/sales-goal.module';
import { SalesModule } from './modules/sales/sales.module';

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true, validate }),
        EnvConfigModule,
        AuthModule,
        HealthModule,
        ProductsModule,
        SalesModule,
        SalesGoalModule,
        DashboardModule,
        ChatModule,
    ],
})
export class AppModule {}
