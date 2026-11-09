import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AppModule } from '@/app.module';
import { appConfig } from '@/config/app.config';
import { CLERK_TOKEN_VERIFIER, ClerkTokenVerifier } from '@/infrastructure/clerk/clerk-token-verifier.interface';
import { OLLAMA_GATEWAY } from '@/infrastructure/ollama/ollama-gateway.interface';
import { mockedOllamaGateway } from '@/infrastructure/ollama/mock/ollama-gateway.mock';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';

const TOKEN_PREFIX = 'int-test-token:';

/**
 * Stands in for Clerk: a token `int-test-token:<clerkUserId>` authenticates as that Clerk user;
 * anything else is rejected. Everything after the token check (user row creation, scoping) is real.
 */
const fakeClerkTokenVerifier: ClerkTokenVerifier = {
    verify: async (token) => (token.startsWith(TOKEN_PREFIX) ? { sub: token.slice(TOKEN_PREFIX.length) } : null),
};

/** `.set(authAs('user_alice'))` — authenticates the request as that Clerk user. */
export function authAs(clerkUserId: string): { Authorization: string } {
    return { Authorization: `Bearer ${TOKEN_PREFIX}${clerkUserId}` };
}

export type IntegrationApp = {
    app: NestExpressApplication;
    prisma: PrismaService;
};

/**
 * The real AppModule (every module, global guard, pipes, filter) over the embedded PostgreSQL
 * started by global-setup.ts. Only Clerk (above) and Ollama (`mockedOllamaGateway`) are faked.
 */
export async function createIntegrationApp(): Promise<IntegrationApp> {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(CLERK_TOKEN_VERIFIER)
        .useValue(fakeClerkTokenVerifier)
        .overrideProvider(OLLAMA_GATEWAY)
        .useValue(mockedOllamaGateway)
        .compile();

    const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
    appConfig(app);
    await app.init();

    return { app, prisma: app.get(PrismaService) };
}

/** Empties every table between tests (the suites share one database and run in band). */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE sales, products, sales_goals, users RESTART IDENTITY CASCADE');
}
