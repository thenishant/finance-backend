-- GmailMessage.body was always required even though nothing populated
-- it; it is now used as a lightweight failure-tracking row for
-- messages that fail ingestion, where we don't have a body to store.
ALTER TABLE "GmailMessage" ALTER COLUMN "body" DROP NOT NULL;

ALTER TABLE "GmailMessage" ADD COLUMN "failedAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "GmailMessage" ADD COLUMN "lastError" TEXT;
ALTER TABLE "GmailMessage" ADD COLUMN "quarantinedAt" TIMESTAMP(3);
