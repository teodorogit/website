import { JestMock } from '@/common/types/types';
import { User } from '../../entities/user.entity';
import { UserRepository } from '../../repository/user.repository';
import { UsersService } from '../../users.service';

export const user_id = '11111111-1111-4111-8111-111111111111';
export const clerk_user_id = 'user_2abcDEFghiJKLmnoPQRstu';

export const other_user_id = '99999999-9999-4999-8999-999999999999';
export const other_clerk_user_id = 'user_2zzzOTHERzzz';

export const mockedUsersService: JestMock<UsersService> = {
    findOrCreateByClerkUserId: jest.fn(),
};

export const mockedUserRepository: JestMock<UserRepository> = {
    findByClerkUserId: jest.fn(),
    insert: jest.fn(),
};

export const defaultUser = (overrides: Partial<User> = {}): User =>
    new User({
        id: user_id,
        clerk_user_id,
        timezone: 'America/Sao_Paulo',
        created_at: new Date('2026-01-01T00:00:00.000Z'),
        updated_at: new Date('2026-01-01T00:00:00.000Z'),
        ...overrides,
    });

export const otherUser = (): User => defaultUser({ id: other_user_id, clerk_user_id: other_clerk_user_id });
