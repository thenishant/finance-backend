-- AlterTable
ALTER TABLE "GmailAccount" ADD COLUMN     "historyId" TEXT;

-- CreateIndex
CREATE INDEX "Transaction_userId_merchantNormalized_idx" ON "Transaction"("userId", "merchantNormalized");
