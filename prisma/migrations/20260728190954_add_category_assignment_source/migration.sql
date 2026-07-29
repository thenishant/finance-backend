/*
  Warnings:

  - The values [AI_CREATED] on the enum `CategoryAssignmentSource` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "CategoryAssignmentSource_new" AS ENUM ('USER', 'AI_EXISTING');
ALTER TABLE "public"."Transaction" ALTER COLUMN "categoryAssignmentSource" DROP DEFAULT;
ALTER TABLE "Transaction" ALTER COLUMN "categoryAssignmentSource" TYPE "CategoryAssignmentSource_new" USING ("categoryAssignmentSource"::text::"CategoryAssignmentSource_new");
ALTER TYPE "CategoryAssignmentSource" RENAME TO "CategoryAssignmentSource_old";
ALTER TYPE "CategoryAssignmentSource_new" RENAME TO "CategoryAssignmentSource";
DROP TYPE "public"."CategoryAssignmentSource_old";
ALTER TABLE "Transaction" ALTER COLUMN "categoryAssignmentSource" SET DEFAULT 'USER';
COMMIT;
