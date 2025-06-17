-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('SUCCEED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "picture" TEXT,
    "googleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnonUser" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnonUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tracker" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL,
    "userId" TEXT,
    "anonUserId" TEXT,

    CONSTRAINT "Tracker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Owner" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "anonUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Owner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chat" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "ownerId" TEXT NOT NULL,

    CONSTRAINT "Chat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "API" (
    "id" TEXT NOT NULL,
    "sql" TEXT NOT NULL,
    "queryParams" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "API_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "text" TEXT,
    "sql" TEXT,
    "table" JSONB,
    "apiId" TEXT,
    "graph" JSONB,
    "chatId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SqlRun" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "sql" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL,
    "creditsSpent" INTEGER NOT NULL DEFAULT 1,
    "failReason" TEXT,
    "executionTime" INTEGER,
    "rowsReturned" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SqlRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiRun" (
    "id" TEXT NOT NULL,
    "apiId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL,
    "creditsSpent" INTEGER NOT NULL DEFAULT 1,
    "failReason" TEXT,
    "executionTime" INTEGER,
    "rowsReturned" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "AnonUser_sessionId_key" ON "AnonUser"("sessionId");

-- CreateIndex
CREATE INDEX "Tracker_userId_idx" ON "Tracker"("userId");

-- CreateIndex
CREATE INDEX "Tracker_anonUserId_idx" ON "Tracker"("anonUserId");

-- CreateIndex
CREATE INDEX "Tracker_ipAddress_idx" ON "Tracker"("ipAddress");

-- CreateIndex
CREATE UNIQUE INDEX "Tracker_sessionId_ipAddress_userAgent_key" ON "Tracker"("sessionId", "ipAddress", "userAgent");

-- CreateIndex
CREATE UNIQUE INDEX "Owner_userId_key" ON "Owner"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Owner_anonUserId_key" ON "Owner"("anonUserId");

-- CreateIndex
CREATE INDEX "Chat_ownerId_idx" ON "Chat"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Message_apiId_key" ON "Message"("apiId");

-- CreateIndex
CREATE INDEX "Message_chatId_idx" ON "Message"("chatId");

-- CreateIndex
CREATE INDEX "SqlRun_messageId_idx" ON "SqlRun"("messageId");

-- CreateIndex
CREATE INDEX "SqlRun_ownerId_idx" ON "SqlRun"("ownerId");

-- CreateIndex
CREATE INDEX "ApiRun_apiId_idx" ON "ApiRun"("apiId");

-- CreateIndex
CREATE INDEX "ApiRun_ownerId_idx" ON "ApiRun"("ownerId");

-- AddForeignKey
ALTER TABLE "Tracker" ADD CONSTRAINT "Tracker_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tracker" ADD CONSTRAINT "Tracker_anonUserId_fkey" FOREIGN KEY ("anonUserId") REFERENCES "AnonUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Owner" ADD CONSTRAINT "Owner_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Owner" ADD CONSTRAINT "Owner_anonUserId_fkey" FOREIGN KEY ("anonUserId") REFERENCES "AnonUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_apiId_fkey" FOREIGN KEY ("apiId") REFERENCES "API"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
