/*
  Warnings:

  - A unique constraint covering the columns `[userId,name]` on the table `Category` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Category_userId_name_parentId_key";

-- CreateIndex
CREATE UNIQUE INDEX "unique_parent_group" ON "Category"("userId", "name");
