import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Cleans up all test data from the database
 * This should be called before each test to ensure clean state
 */
export async function cleanupDatabase() {
  try {
    // Delete in correct order to respect foreign key constraints
    await prisma.message.deleteMany({});
    await prisma.chat.deleteMany({});
    await prisma.sqlRun.deleteMany({});
    await prisma.apiRun.deleteMany({});
    await prisma.aPI.deleteMany({});
    await prisma.owner.deleteMany({});
    await prisma.tracker.deleteMany({});
    await prisma.anonUser.deleteMany({});
    await prisma.passkey.deleteMany({});
    await prisma.session.deleteMany({});
    await prisma.account.deleteMany({});
    await prisma.verification.deleteMany({});
    await prisma.user.deleteMany({});
  } catch (error) {
    console.error('Error cleaning up database:', error);
    throw error;
  }
}

/**
 * Closes the database connection
 * Should be called in afterAll hooks
 */
export async function closeDatabaseConnection() {
  await prisma.$disconnect();
}

export { prisma }; 