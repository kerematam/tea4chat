-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('STARTED', 'STREAMING', 'COMPLETED', 'FAILED', 'ABORTED');

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "status" "MessageStatus" NOT NULL DEFAULT 'COMPLETED';
