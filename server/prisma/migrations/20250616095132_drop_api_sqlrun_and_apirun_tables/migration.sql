/*
  Warnings:

  - You are about to drop the column `apiId` on the `Message` table. All the data in the column will be lost.
  - You are about to drop the `API` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ApiRun` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SqlRun` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_apiId_fkey";

-- DropIndex
DROP INDEX "Message_apiId_key";

-- AlterTable
ALTER TABLE "Message" DROP COLUMN "apiId";

-- DropTable
DROP TABLE "API";

-- DropTable
DROP TABLE "ApiRun";

-- DropTable
DROP TABLE "SqlRun";

-- DropEnum
DROP TYPE "RunStatus";
