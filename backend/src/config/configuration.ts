import { ENV_VARIABLE, NODE_ENV, REQUIRED_ENV_VARIABLE } from '@/common/env-config/env-config.service';

function isBlank(value: unknown): boolean {
    return typeof value !== 'string' || value.trim() === '';
}

/**
 * `ConfigModule.forRoot({ validate })`: fail fast at boot when a required variable is missing or empty,
 * when NODE_ENV is not a known value (a typo such as `prod` must not silently enable development-only
 * features), or when production would verify Clerk tokens through a JWKS network call.
 */
export function validate(config: Record<string, unknown>): Record<string, unknown> {
    const missing: string[] = Object.values(REQUIRED_ENV_VARIABLE).filter((key) => isBlank(config[key]));

    const nodeEnv = config[ENV_VARIABLE.NODE_ENV];
    const knownNodeEnvs: unknown[] = Object.values(NODE_ENV);
    if (!isBlank(nodeEnv) && !knownNodeEnvs.includes(nodeEnv)) {
        throw new Error(`Invalid NODE_ENV "${String(nodeEnv)}": expected one of ${Object.values(NODE_ENV).join(', ')}`);
    }

    // An unset NODE_ENV counts as production (EnvConfigService.nodeEnv fails closed).
    const isProduction = isBlank(nodeEnv) || nodeEnv === NODE_ENV.PRODUCTION;

    // Without the PEM key, every token with an unknown `kid` costs a call to Clerk's JWKS endpoint.
    if (isProduction && isBlank(config[ENV_VARIABLE.CLERK_JWT_KEY])) {
        missing.push(`${ENV_VARIABLE.CLERK_JWT_KEY} (required in production)`);
    }

    if (missing.length > 0) {
        throw new Error(`Missing environment variables: ${missing.join(', ')}`);
    }

    return config;
}
