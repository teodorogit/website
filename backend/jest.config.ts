import { pathsToModuleNameMapper } from 'ts-jest';
import { readFileSync } from 'node:fs';

const { compilerOptions } = JSON.parse(readFileSync('./tsconfig.json', 'utf-8'));

export default {
    moduleFileExtensions: ['js', 'json', 'ts'],
    moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths, { prefix: '<rootDir>/' }),
    testRegex: '.*\\.spec\\.ts$',
    transform: {
        '^.+\\.ts$': 'ts-jest',
    },
    collectCoverageFrom: ['src/**/*.ts', '!src/**/test/**', '!src/main.ts'],
    coverageDirectory: './coverage',
    testEnvironment: 'node',
};
