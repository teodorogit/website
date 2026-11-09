import baseConfig from './jest.config';

export default {
    ...baseConfig,
    testRegex: '.*\\.e2e-spec\\.ts$',
};
