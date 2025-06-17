/*
  Warnings:

  - You are about to drop the column `graph` on the `Message` table. All the data in the column will be lost.
  - You are about to drop the column `sql` on the `Message` table. All the data in the column will be lost.
  - You are about to drop the column `table` on the `Message` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Message" DROP COLUMN "graph",
DROP COLUMN "sql",
DROP COLUMN "table";
