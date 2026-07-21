-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "FinancialAccountType" ADD VALUE 'WALLET';

-- DropIndex
DROP INDEX "FinancialAccount_userId_name_key";

-- AlterTable
ALTER TABLE "FinancialAccount" ADD COLUMN     "availableBalance" DECIMAL(18,2),
ADD COLUMN     "balanceUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "emailMatchers" JSONB,
ADD COLUMN     "externalReference" TEXT,
ADD COLUMN     "institutionName" TEXT,
ADD COLUMN     "isArchived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "nickname" TEXT,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "GmailMessage" ADD COLUMN     "receivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'INR',
ADD COLUMN     "exchangeRate" DECIMAL(18,6),
ADD COLUMN     "merchantNormalized" TEXT,
ADD COLUMN     "originalAmount" DECIMAL(18,2),
ADD COLUMN     "status" "TransactionStatus" NOT NULL DEFAULT 'COMPLETED';

-- DropEnum
DROP TYPE "AccountType";

-- CreateIndex
CREATE INDEX "FinancialAccount_userId_isArchived_idx" ON "FinancialAccount"("userId", "isArchived");

-- CreateIndex
CREATE INDEX "FinancialAccount_userId_name_idx" ON "FinancialAccount"("userId", "name");

-- CreateIndex
CREATE INDEX "Transaction_date_idx" ON "Transaction"("date");
