/*
  Warnings:

  - Made the column `month` on table `Transaction` required. This step will fail if there are existing NULL values in that column.
  - Made the column `year` on table `Transaction` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Transaction" ALTER COLUMN "month" SET NOT NULL,
ALTER COLUMN "year" SET NOT NULL;
