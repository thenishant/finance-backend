-- CreateEnum
CREATE TYPE "CategoryAssignmentSource" AS ENUM ('USER', 'AI_EXISTING', 'AI_CREATED');

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "categoryAssignmentSource" "CategoryAssignmentSource" NOT NULL DEFAULT 'USER';
