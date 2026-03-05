-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "month" INTEGER,
ADD COLUMN     "year" INTEGER;

-- CreateTable
CREATE TABLE "InvestmentGoal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "goalPercent" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvestmentGoal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvestmentGoal_userId_year_month_idx" ON "InvestmentGoal"("userId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "InvestmentGoal_userId_year_month_key" ON "InvestmentGoal"("userId", "year", "month");

-- CreateIndex
CREATE INDEX "Transaction_userId_year_month_idx" ON "Transaction"("userId", "year", "month");

-- CreateIndex
CREATE INDEX "Transaction_userId_type_year_month_idx" ON "Transaction"("userId", "type", "year", "month");

-- AddForeignKey
ALTER TABLE "InvestmentGoal" ADD CONSTRAINT "InvestmentGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
