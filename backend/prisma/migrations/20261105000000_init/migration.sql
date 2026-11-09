-- Initial schema (BACKEND_SCOPE.md §3). Generated with `prisma migrate diff --from-empty`, plus the
-- parts Prisma cannot model: extensions and CHECK constraints (Prisma ignores and never drops CHECKs).

-- gen_random_uuid() (built into PG13+, kept for older servers) and case-insensitive product names.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clerk_user_id" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "name" CITEXT NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "preparation_cost_cents" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "product_id" UUID,
    "product_name_snapshot" VARCHAR(32) NOT NULL,
    "unit_price_cents" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_goals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_goals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_clerk_user_id_key" ON "users"("clerk_user_id");

-- CreateIndex
CREATE INDEX "products_user_created_idx" ON "products"("user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "products_user_name_unique" ON "products"("user_id", "name");

-- CreateIndex
CREATE INDEX "sales_user_occurred_idx" ON "sales"("user_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "sales_user_product_idx" ON "sales"("user_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_goals_user_id_key" ON "sales_goals"("user_id");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_goals" ADD CONSTRAINT "sales_goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CHECK constraints (BACKEND_SCOPE.md §3)
ALTER TABLE "products" ADD CONSTRAINT "products_name_length_check" CHECK (char_length("name") BETWEEN 1 AND 32);
ALTER TABLE "products" ADD CONSTRAINT "products_price_cents_check" CHECK ("price_cents" > 0);
ALTER TABLE "products" ADD CONSTRAINT "products_preparation_cost_cents_check" CHECK ("preparation_cost_cents" >= 0);
ALTER TABLE "sales" ADD CONSTRAINT "sales_product_name_snapshot_check" CHECK (char_length("product_name_snapshot") >= 1);
ALTER TABLE "sales" ADD CONSTRAINT "sales_unit_price_cents_check" CHECK ("unit_price_cents" >= 0);
ALTER TABLE "sales" ADD CONSTRAINT "sales_quantity_check" CHECK ("quantity" > 0);
ALTER TABLE "sales_goals" ADD CONSTRAINT "sales_goals_amount_cents_check" CHECK ("amount_cents" > 0);
