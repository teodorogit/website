/** Bidirectional persistence row (`P`) ↔ domain entity (`E`). Services never see raw Prisma rows. */
export interface Mapper<P, E> {
    mapFromEntity(entity: E): P;
    mapToEntity(row: P): E;
}
