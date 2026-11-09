import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { USER_REPOSITORY } from '../repository/user.repository';
import { UsersService } from '../users.service';
import { User } from '../entities/user.entity';
import { clerk_user_id, defaultUser, mockedUserRepository } from './utils/test.utils';

const uniqueViolation = () =>
    new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' });

describe('UsersService', () => {
    let service: UsersService;

    beforeEach(async () => {
        jest.resetAllMocks();

        const moduleRef = await Test.createTestingModule({
            providers: [{ provide: USER_REPOSITORY, useValue: mockedUserRepository }, UsersService],
        }).compile();

        service = moduleRef.get(UsersService);
    });

    describe('findOrCreateByClerkUserId', () => {
        it('returns the existing user without inserting', async () => {
            const user = defaultUser();
            mockedUserRepository.findByClerkUserId.mockResolvedValueOnce(user);

            await expect(service.findOrCreateByClerkUserId(clerk_user_id)).resolves.toBe(user);
            expect(mockedUserRepository.insert).not.toHaveBeenCalled();
        });

        it('creates the user with the default timezone on first access', async () => {
            mockedUserRepository.findByClerkUserId.mockResolvedValueOnce(null);
            mockedUserRepository.insert.mockImplementationOnce(async (user: User) => user);

            const created = await service.findOrCreateByClerkUserId(clerk_user_id);

            expect(created.clerk_user_id).toBe(clerk_user_id);
            expect(created.timezone).toBe('America/Sao_Paulo');
            expect(mockedUserRepository.insert).toHaveBeenCalledTimes(1);
        });

        it('re-reads the row when a concurrent first request won the insert race', async () => {
            const winner = defaultUser();
            mockedUserRepository.findByClerkUserId.mockResolvedValueOnce(null).mockResolvedValueOnce(winner);
            mockedUserRepository.insert.mockRejectedValueOnce(uniqueViolation());

            await expect(service.findOrCreateByClerkUserId(clerk_user_id)).resolves.toBe(winner);
        });

        it('propagates non-unique insert failures', async () => {
            const failure = new Error('connection lost');
            mockedUserRepository.findByClerkUserId.mockResolvedValueOnce(null);
            mockedUserRepository.insert.mockRejectedValueOnce(failure);

            await expect(service.findOrCreateByClerkUserId(clerk_user_id)).rejects.toBe(failure);
        });
    });
});
