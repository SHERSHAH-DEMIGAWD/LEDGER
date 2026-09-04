-- Migration: add_terms_refinement
-- Description: Add isPending to DealVersion and acceptedVersionNumber to Deal for term refinement support
-- Date: 2025-01-01

-- 1. Add isPending column to DealVersion
ALTER TABLE "DealVersion" ADD COLUMN "isPending" BOOLEAN NOT NULL DEFAULT false;

-- 2. Add acceptedVersionNumber column to Deal
ALTER TABLE "Deal" ADD COLUMN "acceptedVersionNumber" INTEGER;

-- 3. Initialize acceptedVersionNumber for existing deals
-- For deals with versions, set acceptedVersionNumber to the latest version number
-- (preserving existing behavior where latest = authoritative)
UPDATE "Deal" d
SET "acceptedVersionNumber" = (
    SELECT MAX("versionNumber")
    FROM "DealVersion" v
    WHERE v."dealId" = d.id
)
WHERE EXISTS (
    SELECT 1 FROM "DealVersion" v WHERE v."dealId" = d.id
);

-- 4. Create index on isPending for efficient queries
CREATE INDEX IF NOT EXISTS "DealVersion_dealId_isPending_idx" ON "DealVersion"("dealId", "isPending");

COMMENT ON COLUMN "DealVersion"."isPending" IS 'True if this version is a pending term proposal awaiting counterparty acceptance.';
COMMENT ON COLUMN "Deal"."acceptedVersionNumber" IS 'The version number of the currently authoritative/accepted DealVersion. Null for legacy state.';
