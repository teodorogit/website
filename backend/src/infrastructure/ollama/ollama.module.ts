import { Module } from '@nestjs/common';
import { EnvConfigModule } from '@/common/env-config/env-config.module';
import { OLLAMA_GATEWAY } from './ollama-gateway.interface';
import { OllamaHttpGateway } from './ollama.gateway';

@Module({
    imports: [EnvConfigModule],
    providers: [{ provide: OLLAMA_GATEWAY, useClass: OllamaHttpGateway }],
    exports: [OLLAMA_GATEWAY],
})
export class OllamaModule {}
