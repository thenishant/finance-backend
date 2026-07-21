/*
  Warnings:

  - Made the column `last4` on table `FinancialAccount` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "MerchantMappingSource" AS ENUM ('RULE', 'AI', 'USER');

-- AlterTable
ALTER TABLE "FinancialAccount" ALTER COLUMN "last4" SET NOT NULL;

-- CreateTable
CREATE TABLE "MerchantMapping" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "displayName" TEXT,
    "categoryId" TEXT NOT NULL,
    "source" "MerchantMappingSource" NOT NULL,
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MerchantMapping_userId_normalizedName_key" ON "MerchantMapping"("userId", "normalizedName");

-- AddForeignKey
ALTER TABLE "MerchantMapping" ADD CONSTRAINT "MerchantMapping_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantMapping" ADD CONSTRAINT "MerchantMapping_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
