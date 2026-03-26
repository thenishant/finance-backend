-- DropIndex
DROP INDEX "InvestmentGoal_userId_year_idx";

-- DropIndex
DROP INDEX "LedgerEntry_transactionId_accountId_amount_key";

-- DropIndex
DROP INDEX "MonthlyAnalytics_userId_year_idx";

-- DropIndex
DROP INDEX "MonthlyAnalytics_userId_year_month_idx";

-- DropIndex
DROP INDEX "Transaction_userId_year_deletedAt_idx";

-- AlterTable
ALTER TABLE "Account" ALTER COLUMN "balance" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "LedgerEntry" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "MonthlyAnalytics" ALTER COLUMN "totalIncome" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "totalExpense" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "totalInvestment" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "metadata" JSONB,
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2);
