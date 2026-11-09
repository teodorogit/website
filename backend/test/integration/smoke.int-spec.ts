import { HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { IntegrationApp, authAs, createIntegrationApp, resetDatabase } from './int-app.util';

describe('Integration smoke (real PostgreSQL)', () => {
    let ctx: IntegrationApp;

    beforeAll(async () => {
        ctx = await createIntegrationApp();
    });

    afterAll(async () => {
        await ctx.app.close();
    });

    beforeEach(async () => {
        await resetDatabase(ctx.prisma);
    });

    it('applies the migration with extensions and CHECK constraints', async () => {
        const extensions = await ctx.prisma.$queryRaw<{ extname: string }[]>`SELECT extname FROM pg_extension`;
        expect(extensions.map((e) => e.extname)).toEqual(expect.arrayContaining(['citext', 'pgcrypto']));

        const checks = await ctx.prisma.$queryRaw<{ conname: string }[]>`
            SELECT conname FROM pg_constraint WHERE contype = 'c' ORDER BY conname`;
        expect(checks.map((c) => c.conname)).toEqual(
            expect.arrayContaining([
                'products_price_cents_check',
                'sales_quantity_check',
                'sales_goals_amount_cents_check',
            ]),
        );
    });

    it('creates the local user on the first authenticated request', async () => {
        await request(ctx.app.getHttpServer()).get('/api/products').set(authAs('user_alice')).expect(HttpStatus.OK);
        await request(ctx.app.getHttpServer()).get('/api/products').set(authAs('user_alice')).expect(HttpStatus.OK);

        const users = await ctx.prisma.user.findMany();
        expect(users).toHaveLength(1);
        expect(users[0]).toMatchObject({ clerk_user_id: 'user_alice', timezone: 'America/Sao_Paulo' });
    });

    it('rejects requests without a valid token', async () => {
        await request(ctx.app.getHttpServer()).get('/api/products').expect(HttpStatus.UNAUTHORIZED);
        await request(ctx.app.getHttpServer())
            .get('/api/products')
            .set('Authorization', 'Bearer forged')
            .expect(HttpStatus.UNAUTHORIZED);
        expect(await ctx.prisma.user.count()).toBe(0);
    });
});
