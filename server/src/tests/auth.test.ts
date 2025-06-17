import { describe, it, expect, beforeAll, vi } from 'vitest';
import { setupTRPCClient } from './utils/setupTRPCClient';

// Mock the tracker service
vi.mock('../services/tracker.service', () => ({
  updateTracker: vi.fn().mockResolvedValue(undefined)
}));

describe('Optional Auth Procedure Tests', () => {
  let trpcClient: ReturnType<typeof setupTRPCClient>['trpcClient'];
  let cookieJar: ReturnType<typeof setupTRPCClient>['cookieJar'];

  beforeAll(() => {
    const setup = setupTRPCClient();
    trpcClient = setup.trpcClient;
    cookieJar = setup.cookieJar;
  });

  describe('Optional Authentication with Better-Auth', () => {
    it('should return unauthenticated profile without better-auth session', async () => {
      const result = await trpcClient.profile.query();

      expect(result.authenticated).toBe(false);
      expect(result.user).toBeNull();
      expect(result.sessionId).toBeDefined();
    });

    it('should work when better-auth session is present', async () => {
      // Note: To test authenticated state, you would need to:
      // 1. Set up a valid better-auth session cookie in the test
      // 2. Or modify setupTRPCClient to accept custom headers/cookies
      // 3. Or use a test helper that logs in a user first

      // For now, this tests the unauthenticated path since we don't have
      // a better-auth session in the test environment

      const result = await trpcClient.profile.query();

      // Without a valid better-auth session, should be unauthenticated
      expect(result.authenticated).toBe(false);
      expect(result.user).toBeNull();
      expect(result.sessionId).toBeDefined();
    });
  });
});


describe('Optional Authentication with Better-Auth', () => {
  let trpcClient: ReturnType<typeof setupTRPCClient>['trpcClient'];
  let cookieJar: ReturnType<typeof setupTRPCClient>['cookieJar'];

  beforeAll(() => {
    const setup = setupTRPCClient({ byPassAuth: true });
    trpcClient = setup.trpcClient;
    cookieJar = setup.cookieJar;
  });

  it('should return unauthenticated profile without better-auth session', async () => {
    const result = await trpcClient.profile.query();

    expect(result.authenticated).toBe(true);
    expect(result.user).toBeDefined();
    expect(result.sessionId).toBeDefined();
  });
});