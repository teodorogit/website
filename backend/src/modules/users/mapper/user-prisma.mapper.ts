import { Injectable } from '@nestjs/common';
import { User as UserPrisma } from '@prisma/client';
import { Mapper } from '@/common/mapper/mapper';
import { User } from '../entities/user.entity';

export const USER_MAPPER = 'UserMapper';

@Injectable()
export class UserPrismaMapper implements Mapper<UserPrisma, User> {
    mapFromEntity(user: User): UserPrisma {
        return {
            id: user.id,
            clerk_user_id: user.clerk_user_id,
            timezone: user.timezone,
            created_at: user.created_at,
            updated_at: user.updated_at,
        };
    }

    mapToEntity(row: UserPrisma): User {
        return new User({
            id: row.id,
            clerk_user_id: row.clerk_user_id,
            timezone: row.timezone,
            created_at: row.created_at,
            updated_at: row.updated_at,
        });
    }
}
