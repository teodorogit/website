import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ClerkModule } from '@/infrastructure/clerk/clerk.module';
import { UsersModule } from '../users/users.module';
import { ClerkAuthGuard } from './guards/clerk-auth.guard';

/**
 * Importing this module turns on authentication for every route of the app
 * (deny-by-default; opt out with `@Public()`). There is no login endpoint: sessions
 * belong to Clerk on the frontend (BACKEND_SCOPE.md §2 "Login e navegação").
 */
@Module({
    imports: [ClerkModule, UsersModule],
    providers: [{ provide: APP_GUARD, useClass: ClerkAuthGuard }],
})
export class AuthModule {}
