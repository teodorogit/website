import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { API_KEY_SECURITY_NAME } from '@/common/decorators/allow-api-key.decorator';
import { EnvConfigService, NODE_ENV } from '@/common/env-config/env-config.service';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { JsonDepthInterceptor } from '@/common/interceptors/json-depth.interceptor';
import { validationExceptionFactory } from './validation-exception.factory';

export const GLOBAL_PREFIX = 'api';

/**
 * Chat bodies can carry 20 messages × 4,000 characters (up to 4 bytes each in UTF-8) plus
 * JSON overhead, which exceeds Express' 100 KB default.
 */
export const JSON_BODY_LIMIT = '512kb';

/**
 * Global HTTP pipeline. `main.ts` and every e2e spec call this, so specs exercise the real
 * prefix, CORS, validation, error envelope and body limits.
 */
export function appConfig(app: NestExpressApplication): void {
    const envConfigService = app.get(EnvConfigService);

    app.disable('x-powered-by');
    app.setGlobalPrefix(GLOBAL_PREFIX);

    // CORS before the body parser: parser errors (malformed JSON, 413, 415) end the request inside
    // the parser, and without the CORS headers the browser can't read their error envelope.
    app.enableCors({
        origin: envConfigService.frontendUrl
            .split(',')
            .map((origin) => origin.trim())
            .filter(Boolean),
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Authorization', 'Content-Type'],
    });

    app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
    app.useGlobalInterceptors(new JsonDepthInterceptor());

    app.useGlobalPipes(
        new ValidationPipe({
            transform: true,
            whitelist: true,
            forbidNonWhitelisted: true,
            exceptionFactory: validationExceptionFactory,
        }),
    );

    app.useGlobalFilters(new AllExceptionsFilter());

    // Opt-in by environment: unauthenticated API docs only where NODE_ENV says `development` explicitly.
    if (envConfigService.nodeEnv === NODE_ENV.DEVELOPMENT) {
        const document = SwaggerModule.createDocument(
            app,
            new DocumentBuilder()
                .setTitle('Brigadeiro API')
                .setDescription('Contrato: BACKEND_SCOPE.md. Rotas de dados exigem o token de sessão do Clerk.')
                .setVersion('0.1.0')
                .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
                .addApiKey({ type: 'apiKey', in: 'header', name: 'X-Api-Key' }, API_KEY_SECURITY_NAME)
                .build(),
        );

        SwaggerModule.setup(`${GLOBAL_PREFIX}/docs`, app, document, {
            jsonDocumentUrl: `${GLOBAL_PREFIX}/docs-json`,
            swaggerOptions: { persistAuthorization: true },
        });
    }
}
