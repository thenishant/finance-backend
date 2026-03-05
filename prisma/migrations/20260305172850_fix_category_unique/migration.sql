/*
  Warnings:

  - A unique constraint covering the columns `[userId,parentId,name]` on the table `Category` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "unique_parent_group";

-- CreateIndex
CREATE UNIQUE INDEX "Category_userId_parentId_name_key" ON "Category"("userId", "parentId", "name");
