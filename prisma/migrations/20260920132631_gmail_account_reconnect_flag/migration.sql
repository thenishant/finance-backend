-- Drop dead columns (never written/read by application code)
ALTER TABLE "GmailAccount" DROP COLUMN IF EXISTS "accessToken";
ALTER TABLE "GmailAccount" DROP COLUMN IF EXISTS "expiresAt";

-- Track a revoked/expired Gmail authorization without deleting the
-- account row, so historyId/refreshToken/watch state survive until
-- the user reconnects.
ALTER TABLE "GmailAccount" ADD COLUMN "needsReconnect" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "GmailAccount" ADD COLUMN "reconnectReason" TEXT;
