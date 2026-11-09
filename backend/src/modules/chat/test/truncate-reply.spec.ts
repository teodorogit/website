import { truncateReply } from '../utils/truncate-reply';

describe('truncateReply', () => {
    it('returns replies within the limit unchanged', () => {
        expect(truncateReply('Curta.', 10)).toBe('Curta.');
        expect(truncateReply('a'.repeat(10), 10)).toBe('a'.repeat(10));
    });

    it('cuts at the last sentence end that fits, adding an ellipsis', () => {
        const reply = 'Primeira frase aqui. Segunda frase aqui. Terceira frase longa demais.';

        expect(truncateReply(reply, 45)).toBe('Primeira frase aqui. Segunda frase aqui.…');
    });

    it('falls back to the last word boundary when no sentence end is close enough', () => {
        const reply = 'uma lista de palavras sem nenhum ponto final no meio do texto';
        const result = truncateReply(reply, 30);

        expect(result).toBe('uma lista de palavras sem…');
        expect(result.length).toBeLessThanOrEqual(30);
    });

    it('hard-cuts text without boundaries, never leaving half of a surrogate pair', () => {
        const reply = `${'x'.repeat(8)}😀${'y'.repeat(10)}`; // the emoji spans indexes 8–9

        const result = truncateReply(reply, 10); // budget 9 would end on the high surrogate

        expect(result).toBe(`${'x'.repeat(8)}…`);
        expect(result.length).toBeLessThanOrEqual(10);
    });

    it('always fits the limit, ellipsis included', () => {
        const reply = 'Frase. '.repeat(1000);

        expect(truncateReply(reply, 4000).length).toBeLessThanOrEqual(4000);
    });
});
