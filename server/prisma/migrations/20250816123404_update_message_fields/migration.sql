/*
  Warnings:

  - You are about to drop the column `content` on the `Message` table. All the data in the column will be lost.
  - You are about to drop the column `from` on the `Message` table. All the data in the column will be lost.
  - You are about to drop the column `text` on the `Message` table. All the data in the column will be lost.
  - Added the required column `userContent` to the `Message` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Message" DROP COLUMN "content",
DROP COLUMN "from",
DROP COLUMN "text",
ADD COLUMN     "agentContent" TEXT,
ADD COLUMN     "completionTokens" INTEGER,
ADD COLUMN     "errorReason" TEXT,
ADD COLUMN     "finishedAt" TIMESTAMP(3),
ADD COLUMN     "firstByteMs" INTEGER,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "promptTokens" INTEGER,
ADD COLUMN     "providerLatencyMs" INTEGER,
ADD COLUMN     "totalTokens" INTEGER,
ADD COLUMN     "userContent" TEXT NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'STARTED';

-- CreateIndex
CREATE INDEX "Message_chatId_createdAt_idx" ON "Message"("chatId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_status_idx" ON "Message"("status");
