/*
  Warnings:

  - You are about to drop the column `availableBalance` on the `FinancialAccount` table. All the data in the column will be lost.
  - You are about to drop the column `balanceUpdatedAt` on the `FinancialAccount` table. All the data in the column will be lost.
  - You are about to drop the column `currentBalance` on the `FinancialAccount` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "FinancialAccount" DROP COLUMN "availableBalance",
DROP COLUMN "balanceUpdatedAt",
DROP COLUMN "currentBalance";

-- AlterTable
ALTER TABLE "LedgerEntry" ALTER COLUMN "transactionId" DROP NOT NULL;
