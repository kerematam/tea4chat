-- AlterTable
ALTER TABLE "Chat" ADD COLUMN     "modelId" TEXT;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "modelId" TEXT;

-- CreateTable
CREATE TABLE "ModelCatalog" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "ownerId" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "endpoint" TEXT,
    "extra" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnerSettings" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "defaultModelId" TEXT,
    "openaiApiKey" TEXT,
    "anthropicApiKey" TEXT,
    "extra" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OwnerSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ModelCatalog_ownerId_idx" ON "ModelCatalog"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "ModelCatalog_ownerId_name_key" ON "ModelCatalog"("ownerId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "OwnerSettings_ownerId_key" ON "OwnerSettings"("ownerId");

-- AddForeignKey
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "ModelCatalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "ModelCatalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelCatalog" ADD CONSTRAINT "ModelCatalog_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerSettings" ADD CONSTRAINT "OwnerSettings_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerSettings" ADD CONSTRAINT "OwnerSettings_defaultModelId_fkey" FOREIGN KEY ("defaultModelId") REFERENCES "ModelCatalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;
