import { Module } from '@nestjs/common';
import { PrismaModule } from '@/infrastructure/prisma/prisma.module';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { UserPrismaMapper, USER_MAPPER } from './mapper/user-prisma.mapper';
import { UserPrismaRepository } from './repository/user-prisma.repository';
import { USER_REPOSITORY } from './repository/user.repository';
import { UsersService } from './users.service';

@Module({
    imports: [PrismaModule],
    providers: [
        { provide: USER_MAPPER, useClass: UserPrismaMapper },
        {
            provide: USER_REPOSITORY,
            useFactory: (prismaService: PrismaService, mapper: UserPrismaMapper) =>
                new UserPrismaRepository(prismaService, mapper),
            inject: [PrismaService, USER_MAPPER],
        },
        UsersService,
    ],
    exports: [UsersService],
})
export class UsersModule {}
