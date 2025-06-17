import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface TrackerData {
  sessionId: string;
  ipAddress: string;
  userAgent: string;
  userId?: string;
  anonUserId?: string;
}

export async function updateTracker(trackerData: TrackerData): Promise<void> {
  try {
    await prisma.tracker.upsert({
      where: {
        sessionId_ipAddress_userAgent: {
          sessionId: trackerData.sessionId,
          ipAddress: trackerData.ipAddress,
          userAgent: trackerData.userAgent,
        },
      },
      update: {
        lastSeen: new Date(),
        ipAddress: trackerData.ipAddress,
        userAgent: trackerData.userAgent,
        sessionId: trackerData.sessionId,
        ...(trackerData.userId && { userId: trackerData.userId }),
        ...(trackerData.anonUserId && { anonUserId: trackerData.anonUserId }),
      },
      create: {
        firstSeen: new Date(),
        lastSeen: new Date(),
        ipAddress: trackerData.ipAddress,
        userAgent: trackerData.userAgent,
        sessionId: trackerData.sessionId,
        ...(trackerData.userId && { userId: trackerData.userId }),
        ...(trackerData.anonUserId && { anonUserId: trackerData.anonUserId }),
      },
    });
  } catch (error) {
    console.error('Failed to update tracker:', error);
  }
} 