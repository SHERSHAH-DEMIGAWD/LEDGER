-- Migration: Persist latest revision/dispute resolution note on the Deal row.
--
-- Previously, the revision feedback and dispute resolution notes were stored
-- only in the audit metadata. This made them discoverable only by walking the
-- audit history. This column gives callers (and the creator viewing the deal)
-- direct access to the most recent revision/resolution note without having to
-- traverse the audit log.
--
-- Design:
--  - latestRevisionNote stores the most recent revision feedback / dispute
--    resolution note set on the deal. It is independent of the audit log
--    (which remains the authoritative history).
--  - latestRevisionNoteAuthorId records the user who set the note, for
--    accountability and audit context.
--  - latestRevisionNoteAt records when the note was set.
--
-- These are independent from the audit log: the audit event remains the
-- historical evidence of state changes and their notes. The Deal row only
-- mirrors the most recent note for quick retrieval.

ALTER TABLE "Deal" ADD COLUMN "latestRevisionNote" TEXT;
ALTER TABLE "Deal" ADD COLUMN "latestRevisionNoteAuthorId" TEXT;
ALTER TABLE "Deal" ADD COLUMN "latestRevisionNoteAt" TIMESTAMP(3);
