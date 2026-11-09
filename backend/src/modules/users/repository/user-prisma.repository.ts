import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { User } from '../entities/user.entity';
import { UserPrismaMapper } from '../mapper/user-prisma.mapper';
import { UserRepository } from './user.repository';

@Injectable()
export class UserPrismaRepository implements UserRepository {
    constructor(
        private readonly prismaService: PrismaService,
        private readonly userMapper: UserPrismaMapper,
    ) {}

    async findByClerkUserId(clerkUserId: string): Promise<User | null> {
        const row = await this.prismaService.user.findUnique({ where: { clerk_user_id: clerkUserId } });
        return row ? this.userMapper.mapToEntity(row) : null;
    }

    async insert(user: User): Promise<User> {
        const row = await this.prismaService.user.create({ data: this.userMapper.mapFromEntity(user) });
        return this.userMapper.mapToEntity(row);
    }
}
