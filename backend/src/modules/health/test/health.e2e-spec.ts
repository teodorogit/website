import { Body, Controller, Get, HttpStatus, INestApplication, Module, Post } from '@nestjs/common';
import { IsInt, IsString, Min } from 'class-validator';
import request from 'supertest';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { createE2eApp } from '@/common/test/e2e-app.util';
import { mockedClerkTokenVerifier } from '@/infrastructure/clerk/mock/clerk-token-verifier.mock';
import { AuthUser } from '@/modules/auth/auth-user';
import { AUTH_HEADER, authenticateAs } from '@/modules/auth/test/utils/test.utils';
import { mockedUsersService } from '@/modules/users/test/utils/test.utils';
import { HealthModule } from '../health.module';

class ProbeDto {
    @IsString()
    name!: string;

    @IsInt()
    @Min(1)
    quantity!: number;
}

/** Protected probe routes that exercise the global pipeline (guard, validation, filter, body limit). */
@Controller('probe')
class ProbeController {
    @Get('me')
    me(@CurrentUser() user: AuthUser): AuthUser {
        return user;
    }

    @Post('echo')
    echo(@Body() body: ProbeDto): ProbeDto {
        return body;
    }

    @Get('boom')
    boom(): never {
        throw new Error('secret internal detail: postgres://user:pass@db');
    }
}

@Module({ controllers: [ProbeController] })
class ProbeModule {}

describe('Global HTTP pipeline (e2e)', () => {
    let app: INestApplication;

    beforeAll(async () => {
        app = await createE2eApp({ imports: [HealthModule, ProbeModule] });
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(() => {
        jest.resetAllMocks();
    });

    describe('GET /api/health', () => {
        it('returns 200 { status: "ok" } without a token and without touching auth', async () => {
            const response = await request(app.getHttpServer()).get('/api/health').expect(HttpStatus.OK);

            expect(response.body).toEqual({ status: 'ok' });
            expect(mockedClerkTokenVerifier.verify).not.toHaveBeenCalled();
            expect(mockedUsersService.findOrCreateByClerkUserId).not.toHaveBeenCalled();
        });

        it('does not expose the x-powered-by header', async () => {
            const response = await request(app.getHttpServer()).get('/api/health');
            expect(response.headers['x-powered-by']).toBeUndefined();
        });
    });

    describe('authentication (global ClerkAuthGuard)', () => {
        it('401 with the uniform envelope when the Authorization header is missing', async () => {
            const response = await request(app.getHttpServer()).get('/api/probe/me').expect(HttpStatus.UNAUTHORIZED);

            expect(response.body).toEqual({
                error: { code: 'UNAUTHORIZED', message: 'Autenticação necessária.' },
            });
            expect(mockedClerkTokenVerifier.verify).not.toHaveBeenCalled();
        });

        it('401 when the scheme is not Bearer', async () => {
            await request(app.getHttpServer())
                .get('/api/probe/me')
                .set('Authorization', 'Basic abc')
                .expect(HttpStatus.UNAUTHORIZED);
        });

        it('401 when Clerk rejects the token, and no user row is created', async () => {
            mockedClerkTokenVerifier.verify.mockResolvedValueOnce(null);

            await request(app.getHttpServer()).get('/api/probe/me').set(AUTH_HEADER).expect(HttpStatus.UNAUTHORIZED);
            expect(mockedUsersService.findOrCreateByClerkUserId).not.toHaveBeenCalled();
        });

        it('attaches the local user resolved from the token sub', async () => {
            const authUser = authenticateAs();

            const response = await request(app.getHttpServer())
                .get('/api/probe/me')
                .set(AUTH_HEADER)
                .expect(HttpStatus.OK);

            expect(response.body).toEqual(authUser);
        });

        it('500 (not 401) when resolving the user fails for infrastructure reasons', async () => {
            authenticateAs();
            mockedUsersService.findOrCreateByClerkUserId.mockRejectedValueOnce(new Error('db down'));

            const response = await request(app.getHttpServer())
                .get('/api/probe/me')
                .set(AUTH_HEADER)
                .expect(HttpStatus.INTERNAL_SERVER_ERROR);

            expect(response.body.error.code).toBe('INTERNAL_SERVER_ERROR');
        });
    });

    describe('validation', () => {
        beforeEach(() => {
            authenticateAs();
        });

        it('400 VALIDATION_ERROR with pt-BR field details', async () => {
            const response = await request(app.getHttpServer())
                .post('/api/probe/echo')
                .set(AUTH_HEADER)
                .send({ name: 'Brownie', quantity: 0 })
                .expect(HttpStatus.BAD_REQUEST);

            expect(response.body).toEqual({
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Revise os campos enviados.',
                    details: [{ field: 'quantity', message: 'Deve ser maior ou igual a 1.' }],
                },
            });
        });

        it('rejects unknown fields (forbidNonWhitelisted), e.g. a client-sent userId', async () => {
            const response = await request(app.getHttpServer())
                .post('/api/probe/echo')
                .set(AUTH_HEADER)
                .send({ name: 'Brownie', quantity: 1, userId: 'someone-else' })
                .expect(HttpStatus.BAD_REQUEST);

            expect(response.body.error.details).toEqual([{ field: 'userId', message: 'Campo não permitido.' }]);
        });

        it('400 BAD_REQUEST envelope for malformed JSON', async () => {
            const response = await request(app.getHttpServer())
                .post('/api/probe/echo')
                .set(AUTH_HEADER)
                .set('Content-Type', 'application/json')
                .send('{"name":')
                .expect(HttpStatus.BAD_REQUEST);

            expect(response.body).toEqual({ error: { code: 'BAD_REQUEST', message: 'Requisição inválida.' } });
        });

        it('body-parser errors still carry CORS headers for the frontend origin', async () => {
            const response = await request(app.getHttpServer())
                .post('/api/probe/echo')
                .set(AUTH_HEADER)
                .set('Origin', 'http://localhost:5173')
                .set('Content-Type', 'application/json')
                .send('{"name":')
                .expect(HttpStatus.BAD_REQUEST);

            expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
        });

        it.each([
            ['an extra field', (nested: string) => `{"name":"a","quantity":1,"x":${nested}}`],
            ['a declared field', (nested: string) => `{"name":${nested},"quantity":1}`],
        ])('400 (never 500) for deeply nested JSON in %s', async (_case, body) => {
            const nested = '['.repeat(20_000) + ']'.repeat(20_000);

            const response = await request(app.getHttpServer())
                .post('/api/probe/echo')
                .set(AUTH_HEADER)
                .set('Content-Type', 'application/json')
                .send(body(nested))
                .expect(HttpStatus.BAD_REQUEST);

            expect(response.body.error.code).toBe('VALIDATION_ERROR');
            expect(response.body.error.details).toEqual([
                { field: 'body', message: 'Estrutura aninhada demais (máximo de 32 níveis).' },
            ]);
        });

        it('413 PAYLOAD_TOO_LARGE envelope above the JSON body limit', async () => {
            const response = await request(app.getHttpServer())
                .post('/api/probe/echo')
                .set(AUTH_HEADER)
                .send({ name: 'x'.repeat(600 * 1024), quantity: 1 })
                .expect(HttpStatus.PAYLOAD_TOO_LARGE);

            expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
        });
    });

    describe('error envelope', () => {
        it('404 NOT_FOUND envelope for unknown routes (after auth)', async () => {
            authenticateAs();

            const response = await request(app.getHttpServer())
                .get('/api/does-not-exist')
                .set(AUTH_HEADER)
                .expect(HttpStatus.NOT_FOUND);

            expect(response.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Recurso não encontrado.' } });
        });

        it('500 never leaks the internal error message or stack', async () => {
            authenticateAs();

            const response = await request(app.getHttpServer())
                .get('/api/probe/boom')
                .set(AUTH_HEADER)
                .expect(HttpStatus.INTERNAL_SERVER_ERROR);

            expect(response.body).toEqual({
                error: { code: 'INTERNAL_SERVER_ERROR', message: 'Ocorreu um erro inesperado.' },
            });
            expect(JSON.stringify(response.body)).not.toContain('postgres');
        });
    });
});

describe('API docs exposure (fails closed on NODE_ENV)', () => {
    const originalNodeEnv = process.env['NODE_ENV'];

    afterEach(() => {
        process.env['NODE_ENV'] = originalNodeEnv;
    });

    async function docsStatusWith(nodeEnv: string | undefined): Promise<number> {
        if (nodeEnv === undefined) {
            delete process.env['NODE_ENV'];
        } else {
            process.env['NODE_ENV'] = nodeEnv;
        }

        const app = await createE2eApp({ imports: [HealthModule] });
        try {
            authenticateAs();
            const response = await request(app.getHttpServer()).get('/api/docs-json').set(AUTH_HEADER);
            return response.status;
        } finally {
            await app.close();
        }
    }

    it('serves the OpenAPI document only when NODE_ENV is explicitly development', async () => {
        await expect(docsStatusWith('development')).resolves.toBe(HttpStatus.OK);
    });

    it.each([undefined, 'production', 'test', 'prod', 'Production'])(
        'does not serve it with NODE_ENV=%p',
        async (nodeEnv) => {
            await expect(docsStatusWith(nodeEnv)).resolves.toBe(HttpStatus.NOT_FOUND);
        },
    );
});
