import { Module } from '@nestjs/common';
import { EnvConfigModule } from '@/common/env-config/env-config.module';
import { CLERK_TOKEN_VERIFIER } from './clerk-token-verifier.interface';
import { ClerkBackendTokenVerifier } from './clerk-token-verifier';

@Module({
    imports: [EnvConfigModule],
    providers: [{ provide: CLERK_TOKEN_VERIFIER, useClass: ClerkBackendTokenVerifier }],
    exports: [CLERK_TOKEN_VERIFIER],
})
export class ClerkModule {}
