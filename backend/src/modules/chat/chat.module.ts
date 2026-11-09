import { Module } from '@nestjs/common';
import { EnvConfigModule } from '@/common/env-config/env-config.module';
import { OllamaModule } from '@/infrastructure/ollama/ollama.module';
import { PrismaModule } from '@/infrastructure/prisma/prisma.module';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { CHAT_CONTEXT_MAPPER, ChatContextPrismaMapper } from './mapper/chat-context-prisma.mapper';
import { ChatConcurrencyLimiter } from './limiter/chat-concurrency-limiter';
import { ChatContextPrismaRepository } from './repository/chat-context-prisma.repository';
import { CHAT_CONTEXT_REPOSITORY } from './repository/chat-context.repository';
import { ProductRetriever } from './retrieval/product-retriever';

@Module({
    imports: [EnvConfigModule, PrismaModule, OllamaModule],
    controllers: [ChatController],
    providers: [
        { provide: CHAT_CONTEXT_MAPPER, useClass: ChatContextPrismaMapper },
        {
            provide: CHAT_CONTEXT_REPOSITORY,
            useFactory: (prismaService: PrismaService, mapper: ChatContextPrismaMapper) =>
                new ChatContextPrismaRepository(prismaService, mapper),
            inject: [PrismaService, CHAT_CONTEXT_MAPPER],
        },
        ProductRetriever,
        ChatConcurrencyLimiter,
        ChatService,
    ],
})
export class ChatModule {}
