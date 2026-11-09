import { JestMock } from '@/common/types/types';
import { ClerkTokenVerifier } from '../clerk-token-verifier.interface';

export const mockedClerkTokenVerifier: JestMock<ClerkTokenVerifier> = {
    verify: jest.fn(),
};
