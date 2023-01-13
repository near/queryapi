-- This schema can be used when running standalone, however this DB is shared with Pagoda Console.
-- The Console schema is the controlling schema, See https://github.com/near/pagoda-console/blob/develop/database/schemas/alerts/schema.prisma
--   and the migrations generated from that file.

CREATE TYPE alert_rule_kind AS ENUM(
    'ACTIONS', -- RECEIPTS Action (receipts)
    'EVENTS', --- Event(execution outcome logs)
    'STATE_CHANGES'
    --- ACCOUNT_BALANCES state change (accounts)
);

CREATE TYPE chain_id AS ENUM (  'MAINNET', 'TESTNET');

CREATE TYPE destination_type AS ENUM ('WEBHOOK', 'EMAIL', 'TELEGRAM');

CREATE TABLE "alert_rules" (
    "id" SERIAL NOT NULL,
    "alert_rule_kind" "alert_rule_kind" NOT NULL,
    "name" TEXT NOT NULL,
    "matching_rule" JSONB NOT NULL,
    "is_paused" BOOLEAN NOT NULL DEFAULT false,
    "project_slug" TEXT NOT NULL,
    "environment_sub_id" INTEGER NOT NULL,
    "chain_id" "chain_id" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ,
    "updated_by" INTEGER,

    CONSTRAINT "alert_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "destinations" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "project_slug" TEXT NOT NULL,
    "type" "destination_type" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "is_valid" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "updated_at" TIMESTAMPTZ,
    "updated_by" INTEGER,

    CONSTRAINT "destinations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "enabled_destinations" (
    "id" SERIAL NOT NULL,
    "alert_id" INTEGER NOT NULL,
    "destination_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "updated_at" TIMESTAMPTZ,
    "updated_by" INTEGER,

    CONSTRAINT "enabled_destinations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "webhook_destinations" (
    "id" SERIAL NOT NULL,
    "destination_id" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "updated_at" TIMESTAMPTZ,
    "updated_by" INTEGER,

    CONSTRAINT "webhook_destinations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_destinations" (
    "id" SERIAL NOT NULL,
    "destination_id" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "token_expires_at" TIMESTAMPTZ,
    "unsubscribe_token" TEXT,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "updated_at" TIMESTAMPTZ,
    "updated_by" INTEGER,
    "token_created_at" TIMESTAMPTZ,
    CONSTRAINT "email_destinations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_destinations" (
    "id" SERIAL NOT NULL,
    "destination_id" INTEGER NOT NULL,
    "chat_id" DOUBLE PRECISION,
    "chat_title" TEXT,
    "is_group_chat" BOOLEAN,
    "start_token" TEXT,
    "token_expires_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "updated_at" TIMESTAMPTZ,
    "updated_by" INTEGER,

    CONSTRAINT "telegram_destinations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "triggered_alerts" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "alert_id" INTEGER NOT NULL,
    "triggered_in_block_hash" TEXT NOT NULL,
    "triggered_in_transaction_hash" TEXT,
    "triggered_in_receipt_id" TEXT,
    "triggered_at" TIMESTAMPTZ NOT NULL,
    "extra_data" JSONB,

    CONSTRAINT "triggered_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "triggered_alerts_destinations" (
    "triggered_alert_id" INTEGER NOT NULL,
    "alert_id" INTEGER NOT NULL,
    "destination_id" INTEGER NOT NULL,
    "status" INTEGER NOT NULL,
    "response" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "triggered_alerts_destinations_pkey" PRIMARY KEY ("triggered_alert_id","alert_id","destination_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "enabled_destinations_destination_id_alert_id_key" ON "enabled_destinations"("destination_id", "alert_id");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_destinations_destination_id_key" ON "webhook_destinations"("destination_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_destinations_destination_id_key" ON "email_destinations"("destination_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_destinations_token_key" ON "email_destinations"("token");

-- CreateIndex
CREATE UNIQUE INDEX "email_destinations_unsubscribe_token_key" ON "email_destinations"("unsubscribe_token");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_destinations_destination_id_key" ON "telegram_destinations"("destination_id");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_destinations_start_token_key" ON "telegram_destinations"("start_token");

-- AddForeignKey
ALTER TABLE "enabled_destinations" ADD CONSTRAINT "enabled_destinations_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "alert_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enabled_destinations" ADD CONSTRAINT "enabled_destinations_destination_id_fkey" FOREIGN KEY ("destination_id") REFERENCES "destinations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_destinations" ADD CONSTRAINT "webhook_destinations_destination_id_fkey" FOREIGN KEY ("destination_id") REFERENCES "destinations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_destinations" ADD CONSTRAINT "email_destinations_destination_id_fkey" FOREIGN KEY ("destination_id") REFERENCES "destinations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_destinations" ADD CONSTRAINT "telegram_destinations_destination_id_fkey" FOREIGN KEY ("destination_id") REFERENCES "destinations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "triggered_alerts" ADD CONSTRAINT "triggered_alerts_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "alert_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "triggered_alerts_destinations" ADD CONSTRAINT "triggered_alerts_destinations_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "alert_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "triggered_alerts_destinations" ADD CONSTRAINT "triggered_alerts_destinations_destination_id_fkey" FOREIGN KEY ("destination_id") REFERENCES "destinations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "triggered_alerts_destinations" ADD CONSTRAINT "triggered_alerts_destinations_triggered_alert_id_fkey" FOREIGN KEY ("triggered_alert_id") REFERENCES "triggered_alerts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

