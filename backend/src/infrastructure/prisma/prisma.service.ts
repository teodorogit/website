import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Prisma connects lazily on the first query, so booting (and `node dist/main.js --validate`)
 * does not need a reachable database.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
    async onModuleDestroy(): Promise<void> {
        await this.$disconnect();
    }
}

/** The client handed to `prisma.$transaction(async (tx) => …)` callbacks. */
export type PrismaTransactionClient = Prisma.TransactionClient;
