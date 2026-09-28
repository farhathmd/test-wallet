-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('user', 'admin');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('topup', 'transfer');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'user',
    "balance" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" SERIAL NOT NULL,
    "type" "TransactionType" NOT NULL,
    "from_user_id" INTEGER,
    "to_user_id" INTEGER NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "transactions_from_user_created_idx" ON "transactions"("from_user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "transactions_to_user_created_idx" ON "transactions"("to_user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "transactions_type_from_user_idx" ON "transactions"("type", "from_user_id");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_to_user_id_fkey" FOREIGN KEY ("to_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Integrity rules that Prisma's schema language cannot express, kept in the database on purpose.
-- Application code should already prevent all of these; the constraints are the last line of defence
-- against a future bug or a manual UPDATE corrupting the ledger.
ALTER TABLE "users"
    ADD CONSTRAINT "users_username_length_check" CHECK (char_length("username") BETWEEN 3 AND 32),
    -- A negative balance would mean money was created out of thin air.
    ADD CONSTRAINT "users_balance_non_negative_check" CHECK ("balance" >= 0);

ALTER TABLE "transactions"
    -- Debiting a non-positive amount would let a "transfer" credit the sender.
    ADD CONSTRAINT "transactions_amount_positive_check" CHECK ("amount" > 0),
    -- Only a topup may have no sender: money entering the system from outside.
    ADD CONSTRAINT "transactions_sender_required_check"
        CHECK ("from_user_id" IS NOT NULL OR "type" = 'topup'),
    -- A self-transfer would be a no-op that still writes a ledger row.
    ADD CONSTRAINT "transactions_parties_differ_check"
        CHECK ("from_user_id" IS NULL OR "from_user_id" <> "to_user_id");

