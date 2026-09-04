-- Migration: Add Payment table with unique dealId constraint
-- This resolves the payment race condition by making the "claim" atomic:
-- the INSERT INTO Payment with dealId UNIQUE is the serialization point.
-- Concurrent requests will get a unique constraint violation (P2002) before
-- any payment provider call is made, preventing double-charging.

-- 1. Add paymentRecordId column to Deal (denormalized FK for fast lookup)
ALTER TABLE "Deal" ADD COLUMN "paymentRecordId" TEXT;

-- 2. Create Payment table
-- paymentId: the provider's payment/charge ID (reconciliation field)
-- status: tracks the payment lifecycle (PENDING, SUCCEEDED, REFUNDED)
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
    "dealId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paymentId" TEXT NOT NULL,
    "intentId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Payment_dealId_key" UNIQUE ("dealId")
);

-- Indexes for common lookups
CREATE INDEX "Payment_status_idx" ON "Payment"("status");
CREATE INDEX "Payment_actorId_idx" ON "Payment"("actorId");

-- FK from Payment to Deal
ALTER TABLE "Payment"
    ADD CONSTRAINT "Payment_dealId_fkey"
    FOREIGN KEY ("dealId")
    REFERENCES "Deal"("id")
    ON DELETE RESTRICT
    ON UPDATE CASCADE;
