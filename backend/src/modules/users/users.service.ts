import { Inject, Injectable } from '@nestjs/common';
import { isUniqueConstraintError } from '@/infrastructure/prisma/prisma-errors';
import { User } from './entities/user.entity';
import { USER_REPOSITORY, UserRepository } from './repository/user.repository';

@Injectable()
export class UsersService {
    constructor(
        @Inject(USER_REPOSITORY)
        private readonly userRepository: UserRepository,
    ) {}

    /**
     * Returns the local user for a verified Clerk `sub`, creating the row on first access
     * (no Clerk webhook needed, BACKEND_SCOPE.md §1). Two concurrent first requests can both
     * miss the lookup; the loser hits the unique index on `clerk_user_id` and re-reads the winner's row.
     */
    async findOrCreateByClerkUserId(clerkUserId: string): Promise<User> {
        const existing = await this.userRepository.findByClerkUserId(clerkUserId);
        if (existing) {
            return existing;
        }

        try {
            return await this.userRepository.insert(new User({ clerk_user_id: clerkUserId }));
        } catch (error) {
            if (!isUniqueConstraintError(error)) {
                throw error;
            }

            const created = await this.userRepository.findByClerkUserId(clerkUserId);
            if (!created) {
                throw error;
            }

            return created;
        }
    }
}
