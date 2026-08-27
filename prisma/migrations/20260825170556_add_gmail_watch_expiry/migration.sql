/*
  Warnings:

  - The values [AI_EXISTING] on the enum `CategoryAssignmentSource` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `displayName` on the `MerchantMapping` table. All the data in the column will be lost.
  - You are about to drop the column `normalizedName` on the `MerchantMapping` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[userId,merchantId]` on the table `MerchantMapping` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[gmailMessageId]` on the table `Transaction` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `merchantId` to the `MerchantMapping` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "CategoryAssignmentSource_new" AS ENUM ('USER', 'LEARNED', 'AI', 'NONE');
ALTER TABLE "public"."Transaction" ALTER COLUMN "categoryAssignmentSource" DROP DEFAULT;
ALTER TABLE "Transaction" ALTER COLUMN "categoryAssignmentSource" TYPE "CategoryAssignmentSource_new" USING ("categoryAssignmentSource"::text::"CategoryAssignmentSource_new");
ALTER TYPE "CategoryAssignmentSource" RENAME TO "CategoryAssignmentSource_old";
ALTER TYPE "CategoryAssignmentSource_new" RENAME TO "CategoryAssignmentSource";
DROP TYPE "public"."CategoryAssignmentSource_old";
ALTER TABLE "Transaction" ALTER COLUMN "categoryAssignmentSource" SET DEFAULT 'USER';
COMMIT;

-- DropForeignKey
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_gmailMessageId_fkey";

-- DropIndex
DROP INDEX "MerchantMapping_userId_normalizedName_key";

-- AlterTable
ALTER TABLE "GmailAccount" ADD COLUMN     "watchExpiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "MerchantMapping" DROP COLUMN "displayName",
DROP COLUMN "normalizedName",
ADD COLUMN     "merchantId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "MerchantMapping_merchantId_idx" ON "MerchantMapping"("merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantMapping_userId_merchantId_key" ON "MerchantMapping"("userId", "merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_gmailMessageId_key" ON "Transaction"("gmailMessageId");

-- AddForeignKey
ALTER TABLE "MerchantMapping" ADD CONSTRAINT "MerchantMapping_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
