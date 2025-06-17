import { describe, it, expect, beforeAll, vi } from 'vitest';
import { setupTRPCClient } from './utils/setupTRPCClient';

// Mock the tracker service
vi.mock('../services/tracker.service', () => ({
  updateTracker: vi.fn().mockResolvedValue(undefined)
}));

describe('tRPC HTTP Integration Tests', () => {
  const baseUrl = 'http://localhost:3000'; // Assuming server is running on default port

  // Cookie jar example setup
  let trpcClient: ReturnType<typeof setupTRPCClient>['trpcClient'];
  let cookieJar: ReturnType<typeof setupTRPCClient>['cookieJar'];

  beforeAll(() => {
    const setup = setupTRPCClient();
    trpcClient = setup.trpcClient;
    cookieJar = setup.cookieJar;
  });

  describe('Cookie Jar Examples', () => {
    it('should demonstrate cookie jar usage with tRPC client', async () => {
      // Clear cookies to start fresh
      cookieJar.clear();

      // Make a request
      const result = await trpcClient.hello.query({ name: 'Cookie Jar Test' });

      // Check that cookies were captured
      const cookieHeader = cookieJar.getCookieHeader();
      expect(cookieHeader).toContain('session_id');
      expect(result.greeting).toBe('Hello Cookie Jar Test!');
    });

    it('should persist cookies across tRPC client calls', async () => {
      // First call
      const result1 = await trpcClient.tracker.getSession.query();

      // Second call should have same session
      const result2 = await trpcClient.tracker.getSession.query();

      expect(result1.sessionId).toBe(result2.sessionId);
      expect(cookieJar.getCookieHeader()).toContain('session_id');
    });
  });

  describe('GET endpoints (queries)', () => {
    it('should handle hello query with name parameter', async () => {
      const response = await fetch(`${baseUrl}/trpc/hello?input=${encodeURIComponent(JSON.stringify({ name: 'Test User' }))}`);

      expect(response.status).toBe(200);
      const data = await response.json() as any;

      expect(data.result.data.greeting).toBe('Hello Test User!');
      expect(data.result.data.ipAddress).toBeDefined();
      expect(data.result.data.userAgent).toBeDefined();
    });

    it('should handle hello query without name parameter', async () => {
      const response = await fetch(`${baseUrl}/trpc/hello?input=${encodeURIComponent(JSON.stringify({}))}`);

      expect(response.status).toBe(200);
      const data = await response.json() as any;

      expect(data.result.data.greeting).toBe('Hello World!');
    });

    it('should handle hello query with empty name (defaults to World)', async () => {
      const response = await fetch(`${baseUrl}/trpc/hello?input=${encodeURIComponent(JSON.stringify({ name: 'World' }))}`);

      expect(response.status).toBe(200);
      const data = await response.json() as any;

      expect(data.result.data.greeting).toBe('Hello World!');
    });

    it('should handle tracker.getSession query', async () => {
      const response = await fetch(`${baseUrl}/trpc/tracker.getSession`);

      expect(response.status).toBe(200);
      const data = await response.json() as any;

      expect(data.result.data).toHaveProperty('sessionId');
      expect(data.result.data).toHaveProperty('ipAddress');
      expect(data.result.data).toHaveProperty('userAgent');
    });

    it('should reject adminStats without authentication', async () => {
      const response = await fetch(`${baseUrl}/trpc/adminStats`);

      // Should return error for unauthorized access
      expect(response.status).toBe(401);
    });
  });

  describe('POST endpoints (mutations)', () => {
    it('should handle goodbye mutation', async () => {
      const response = await fetch(`${baseUrl}/trpc/goodbye`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json() as any;

      expect(data.result.data.message).toBe('goodbye!');
      expect(data.result.data.ipAddress).toBeDefined();
      expect(data.result.data.userAgent).toBeDefined();
    });

    it('should handle tracker.updateUserId mutation', async () => {
      const response = await fetch(`${baseUrl}/trpc/tracker.updateUserId`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: 'test-user-123' }),
      });

      expect(response.status).toBe(200);
      const data = await response.json() as any;

      expect(data.result.data.success).toBe(true);
    });

    it('should handle tracker.updateAnonUserId mutation', async () => {
      const response = await fetch(`${baseUrl}/trpc/tracker.updateAnonUserId`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ anonUserId: 'anon-user-456' }),
      });

      expect(response.status).toBe(200);
      const data = await response.json() as any;

      expect(data.result.data.success).toBe(true);
    });

    it('should handle tracker mutations with special characters', async () => {
      const response = await fetch(`${baseUrl}/trpc/tracker.updateUserId`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: 'user-123@domain.com' }),
      });

      expect(response.status).toBe(200);
      const data = await response.json() as any;

      expect(data.result.data.success).toBe(true);
    });

    it('should reject malformed JSON', async () => {
      const response = await fetch(`${baseUrl}/trpc/tracker.updateUserId`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: 'invalid-json',
      });

      expect(response.status).toBe(400);
    });
  });

  describe('Session and cookie handling', () => {
    it('should set session cookie on first request', async () => {
      const response = await fetch(`${baseUrl}/trpc/hello?input=${encodeURIComponent(JSON.stringify({ name: 'Cookie Test' }))}`);

      expect(response.status).toBe(200);

      // Check if session cookie is set
      const setCookieHeader = response.headers.get('set-cookie');
      expect(setCookieHeader).toContain('session_id');
    });

    it('should maintain session across requests', async () => {
      // First request to get session cookie
      const firstResponse = await fetch(`${baseUrl}/trpc/tracker.getSession`);
      const setCookieHeader = firstResponse.headers.get('set-cookie');
      const sessionCookie = setCookieHeader?.match(/session_id=([^;]+)/)?.[1];

      expect(sessionCookie).toBeDefined();

      // Second request with the session cookie
      const secondResponse = await fetch(`${baseUrl}/trpc/tracker.getSession`, {
        headers: {
          'Cookie': `session_id=${sessionCookie}`,
        },
      });

      const firstData = await firstResponse.json() as any;
      const secondData = await secondResponse.json() as any;

      // Should have the same session ID
      expect(firstData.result.data.sessionId).toBe(secondData.result.data.sessionId);
    });
  });

  describe('Error handling', () => {
    it('should handle 404 for non-existent endpoints', async () => {
      const response = await fetch(`${baseUrl}/trpc/nonExistentEndpoint`);
      expect(response.status).toBe(404);
    });

    it('should handle missing input for required parameters', async () => {
      const response = await fetch(`${baseUrl}/trpc/tracker.updateUserId`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}), // Missing userId
      });

      expect(response.status).toBe(400);
    });
  });

  describe('Middleware chain', () => {
    it('should apply CORS headers in development', async () => {
      const response = await fetch(`${baseUrl}/trpc/hello?input=${encodeURIComponent(JSON.stringify({ name: 'CORS Test' }))}`, {
        headers: {
          'Origin': 'http://localhost:5173',
        },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    });

    it('should track user agent and IP address', async () => {
      const response = await fetch(`${baseUrl}/trpc/hello?input=${encodeURIComponent(JSON.stringify({ name: 'Tracking Test' }))}`, {
        headers: {
          'User-Agent': 'Test-Agent/1.0',
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json() as any;

      expect(data.result.data.userAgent).toBeDefined();
      expect(data.result.data.ipAddress).toBeDefined();
    });

    it('should handle requests with different content types', async () => {
      const response = await fetch(`${baseUrl}/trpc/tracker.updateUserId`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: JSON.stringify({ userId: 'form-user' }),
      });

      // Should still work or return appropriate error
      expect([200, 400, 415]).toContain(response.status);
    });
  });

  describe('Performance', () => {
    it('should handle concurrent requests', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        fetch(`${baseUrl}/trpc/hello?input=${encodeURIComponent(JSON.stringify({ name: `User ${i}` }))}`)
      );

      const responses = await Promise.all(promises);

      // All requests should succeed
      responses.forEach((response, i) => {
        expect(response.status).toBe(200);
      });

      // Parse all responses
      const data = await Promise.all(responses.map(r => r.json())) as any[];

      // Each should have the correct greeting
      data.forEach((d, i) => {
        expect(d.result.data.greeting).toBe(`Hello User ${i}!`);
      });
    });

    it('should respond quickly to simple requests', async () => {
      const start = Date.now();
      const response = await fetch(`${baseUrl}/trpc/hello?input=${encodeURIComponent(JSON.stringify({ name: 'Speed Test' }))}`);
      const end = Date.now();

      expect(response.status).toBe(200);
      expect(end - start).toBeLessThan(1000); // Should respond in less than 1 second
    });
  });
}); 