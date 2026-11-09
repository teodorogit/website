import { ModuleMetadata } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { EnvConfigModule } from '@/common/env-config/env-config.module';
import { appConfig } from '@/config/app.config';
import { CLERK_TOKEN_VERIFIER } from '@/infrastructure/clerk/clerk-token-verifier.interface';
import { mockedClerkTokenVerifier } from '@/infrastructure/clerk/mock/clerk-token-verifier.mock';
import { AuthModule } from '@/modules/auth/auth.module';
import { mockedUsersService } from '@/modules/users/test/utils/test.utils';
import { UsersService } from '@/modules/users/users.service';

export type ProviderOverride = {
    provide: string | symbol | (abstract new (...args: any[]) => unknown) | ((...args: any[]) => unknown);
    useValue: unknown;
};

/**
 * Boots the real HTTP pipeline (`appConfig`: `/api` prefix, global auth guard, validation pipe,
 * error filter, body limit) around the given feature modules, with Clerk and the users service
 * mocked. Follow with `authenticateAs(user)` and send `AUTH_HEADER`.
 *
 * The persistence layer is never touched: override the module's service (controller specs) or
 * repository token with `overrides`.
 */
export async function createE2eApp(options: {
    imports: NonNullable<ModuleMetadata['imports']>;
    overrides?: ProviderOverride[];
}): Promise<NestExpressApplication> {
    let builder = Test.createTestingModule({
        imports: [
            ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
            EnvConfigModule,
            AuthModule,
            ...options.imports,
        ],
    })
        .overrideProvider(CLERK_TOKEN_VERIFIER)
        .useValue(mockedClerkTokenVerifier)
        .overrideProvider(UsersService)
        .useValue(mockedUsersService);

    for (const override of options.overrides ?? []) {
        builder = builder.overrideProvider(override.provide).useValue(override.useValue);
    }

    const moduleRef = await builder.compile();
    const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });

    appConfig(app);
    await app.init();

    return app;
}
