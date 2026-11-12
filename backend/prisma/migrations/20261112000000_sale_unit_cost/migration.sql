-- Per-sale snapshot of the product's preparation cost (BACKEND_SCOPE.md §3), so profit is computed with
-- the cost each sale had when it was recorded and never follows later edits to the product.
-- Hand-written: Prisma does not model CHECK constraints (it ignores and never drops them).

-- AlterTable
ALTER TABLE "sales" ADD COLUMN "unit_cost_cents" INTEGER NOT NULL DEFAULT 0;

-- Backfill: sales recorded before this column existed take the cost their product has today.
-- Sales whose product was already deleted (product_id IS NULL) keep 0: their cost is unknown.
UPDATE "sales" AS s
SET "unit_cost_cents" = p."preparation_cost_cents"
FROM "products" AS p
WHERE p."id" = s."product_id"
  AND p."user_id" = s."user_id";

-- CHECK constraint (BACKEND_SCOPE.md §3)
ALTER TABLE "sales" ADD CONSTRAINT "sales_unit_cost_cents_check" CHECK ("unit_cost_cents" >= 0);
