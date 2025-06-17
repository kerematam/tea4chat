import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { setupTRPCClient } from './utils/setupTRPCClient';

// Mock the tracker service to avoid database calls
vi.mock('../services/tracker.service', () => ({
    updateTracker: vi.fn().mockResolvedValue(undefined)
}));

describe('tRPC Client Integration Tests', () => {
    let trpcClient: ReturnType<typeof setupTRPCClient>['trpcClient'];
    let cookieJar: ReturnType<typeof setupTRPCClient>['cookieJar'];

    beforeAll(() => {
        const setup = setupTRPCClient();
        trpcClient = setup.trpcClient;
        cookieJar = setup.cookieJar;
    });

    describe('Cookie handling', () => {
        it('should properly handle and persist cookies', async () => {
            cookieJar.clear();
            await trpcClient.hello.query({ name: 'Cookie Test 1' });

            const cookieHeader = cookieJar.getCookieHeader();
            expect(cookieHeader).toContain('session_id');

            await trpcClient.hello.query({ name: 'Cookie Test 2' });
            const cookieHeader_2 = cookieJar.getCookieHeader();
            expect(cookieHeader).toBe(cookieHeader_2);

            cookieJar.clear();
            await trpcClient.hello.query({ name: 'Cookie Test 3' });
            const cookieHeader_3 = cookieJar.getCookieHeader();
            expect(cookieHeader).not.toBe(cookieHeader_3);
        });
    });
}); 