import { JestMock } from '@/common/types/types';
import { OllamaGateway } from '../ollama-gateway.interface';

export const mockedOllamaGateway: JestMock<OllamaGateway> = {
    chat: jest.fn(),
    embed: jest.fn(),
    embeddingModel: jest.fn(),
};
