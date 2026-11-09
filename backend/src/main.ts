import { LogLevel } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { EnvConfigService, NODE_ENV } from './common/env-config/env-config.service';
import { appConfig } from './config/app.config';

/** `node dist/main.js --validate`: resolve the whole DI graph without listening (runs in `postbuild`). */
async function verifyDependencies(): Promise<void> {
    try {
        const app = await NestFactory.createApplicationContext(AppModule, { abortOnError: false, logger: ['error'] });
        await app.close();
        console.log('All dependencies are valid.');
    } catch (error) {
        console.error('Dependency verification failed:', error instanceof Error ? error.message : error);
        process.exit(1);
    }
}

async function bootstrap(): Promise<void> {
    const args = process.argv.slice(2);

    if (args.includes('--validate')) {
        return verifyDependencies();
    }

    // AppModule's ConfigModule.forRoot loads .env into process.env asynchronously. Debug logs only
    // when NODE_ENV says `development` explicitly (fail closed, like EnvConfigService.nodeEnv).
    await ConfigModule.envVariablesLoaded;
    const logger: LogLevel[] = args.includes('--verbose')
        ? ['error', 'warn', 'log', 'debug', 'verbose']
        : process.env['NODE_ENV'] === NODE_ENV.DEVELOPMENT
          ? ['error', 'warn', 'log', 'debug']
          : ['error', 'warn', 'log'];

    const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger });

    appConfig(app);
    app.enableShutdownHooks();

    await app.listen(app.get(EnvConfigService).port);
}

void bootstrap();
