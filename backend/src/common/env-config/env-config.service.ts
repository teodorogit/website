import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ObjectValues } from '../types/types';

export const NODE_ENV = {
    PRODUCTION: 'production',
    DEVELOPMENT: 'development',
    TEST: 'test',
} as const;

export type NodeEnv = ObjectValues<typeof NODE_ENV>;

/** Variables the app refuses to boot without (see `config/configuration.ts`). */
export const REQUIRED_ENV_VARIABLE = {
    DATABASE_URL: 'DATABASE_URL',
    FRONTEND_URL: 'FRONTEND_URL',
    CLERK_SECRET_KEY: 'CLERK_SECRET_KEY',
    CLERK_ISSUER: 'CLERK_ISSUER',
    OLLAMA_URL: 'OLLAMA_URL',
    CHAT_MODEL: 'CHAT_MODEL',
    EMBEDDING_MODEL: 'EMBEDDING_MODEL',
} as const;

export const OPTIONAL_ENV_VARIABLE = {
    NODE_ENV: 'NODE_ENV',
    PORT: 'PORT',
    /** PEM public key: verifies Clerk tokens without a network call to the JWKS endpoint. */
    CLERK_JWT_KEY: 'CLERK_JWT_KEY',
    /** Comma-separated origins accepted in the token's `azp` claim. Defaults to FRONTEND_URL. */
    CLERK_AUTHORIZED_PARTIES: 'CLERK_AUTHORIZED_PARTIES',
    /** Upper bound for one Ollama call (chat or embeddings), in ms. */
    OLLAMA_TIMEOUT_MS: 'OLLAMA_TIMEOUT_MS',
    /** Chat requests one user may have in flight at once (default 1). */
    CHAT_MAX_INFLIGHT_PER_USER: 'CHAT_MAX_INFLIGHT_PER_USER',
    /** Chat requests the whole process may have in flight at once (default 4). */
    CHAT_MAX_INFLIGHT_GLOBAL: 'CHAT_MAX_INFLIGHT_GLOBAL',
    /** Key Power BI sends in `X-Api-Key` to read the dashboard metrics. Unset = key access off. */
    POWERBI_API_KEY: 'POWERBI_API_KEY',
    /** Clerk user id (`user_…`) whose data that key reads. Required when the key is set. */
    POWERBI_CLERK_USER_ID: 'POWERBI_CLERK_USER_ID',
} as const;

/** Shortest `POWERBI_API_KEY` accepted at boot: it is a long-lived secret that never expires. */
export const MIN_API_KEY_LENGTH = 32;

/** A long-lived, read-only credential that stands for one account. */
export type ApiKeyAccess = {
    apiKey: string;
    clerkUserId: string;
};

export const ENV_VARIABLE = {
    ...REQUIRED_ENV_VARIABLE,
    ...OPTIONAL_ENV_VARIABLE,
} as const;

export type EnvVariable = ObjectValues<typeof ENV_VARIABLE>;

/** Single place to read configuration — don't read `process.env` elsewhere. */
@Injectable()
export class EnvConfigService {
    constructor(private readonly configService: ConfigService) {}

    get(key: EnvVariable): string | undefined {
        const value = this.configService.get<string>(key);
        return value === undefined || value === '' ? undefined : value;
    }

    getOrThrow(key: EnvVariable): string {
        const value = this.get(key);
        if (value === undefined) {
            throw new Error(`Missing environment variable: ${key}`);
        }

        return value;
    }

    /**
     * Fails closed: anything other than an explicit `development` or `test` (unset included) is
     * production, so a missing or misspelled NODE_ENV never enables development-only features.
     * `config/configuration.ts` also rejects unknown values at boot.
     */
    get nodeEnv(): NodeEnv {
        const value = this.get(ENV_VARIABLE.NODE_ENV);
        return value === NODE_ENV.DEVELOPMENT || value === NODE_ENV.TEST ? value : NODE_ENV.PRODUCTION;
    }

    get port(): number {
        const value = Number(this.get(ENV_VARIABLE.PORT));
        return Number.isInteger(value) && value > 0 ? value : 3001;
    }

    get frontendUrl(): string {
        return this.getOrThrow(ENV_VARIABLE.FRONTEND_URL);
    }

    get clerkAuthorizedParties(): string[] {
        const raw = this.get(ENV_VARIABLE.CLERK_AUTHORIZED_PARTIES) ?? this.frontendUrl;
        return raw
            .split(',')
            .map((origin) => origin.trim())
            .filter(Boolean);
    }

    get ollamaTimeoutMs(): number {
        return this.positiveInteger(ENV_VARIABLE.OLLAMA_TIMEOUT_MS, 120_000);
    }

    get chatMaxInflightPerUser(): number {
        return this.positiveInteger(ENV_VARIABLE.CHAT_MAX_INFLIGHT_PER_USER, 1);
    }

    get chatMaxInflightGlobal(): number {
        return this.positiveInteger(ENV_VARIABLE.CHAT_MAX_INFLIGHT_GLOBAL, 4);
    }

    /**
     * The key accepted on routes marked `@AllowApiKey()` and the account it reads; undefined when key
     * access is off. `config/configuration.ts` refuses to boot with a key that has no account or is too short.
     */
    get powerBiAccess(): ApiKeyAccess | undefined {
        const apiKey = this.get(ENV_VARIABLE.POWERBI_API_KEY);
        const clerkUserId = this.get(ENV_VARIABLE.POWERBI_CLERK_USER_ID);

        return apiKey !== undefined && clerkUserId !== undefined ? { apiKey, clerkUserId } : undefined;
    }

    private positiveInteger(key: EnvVariable, fallback: number): number {
        const value = Number(this.get(key));
        return Number.isInteger(value) && value > 0 ? value : fallback;
    }
}
