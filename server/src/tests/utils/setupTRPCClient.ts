import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../../router';
import CookieJar from './CookieJar';

export function setupTRPCClient({
  baseUrl = 'http://localhost:3000/trpc',
  byPassAuth = false }: {
    baseUrl?: string,
    byPassAuth?: boolean
  }
  = {}) {
  const cookieJar = new CookieJar();

  const trpcClient = createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: baseUrl,
        headers: () => {
          let headers: Record<string, string> = {};
          const cookieHeader = cookieJar.getCookieHeader();
          if (cookieHeader) {
            headers['Cookie'] = cookieHeader;
          }
          if (byPassAuth) {
            headers['by-pass-auth'] = 'true' as string;
          }
          return headers;
        },
      }),
    ],
  });

  // Intercept global fetch to capture cookies
  const originalFetch = global.fetch;
  global.fetch = (async (url, options) => {
    const response = await originalFetch(url, options);

    // Extract and store cookies from the response
    const setCookieHeader = response.headers.get('set-cookie');
    if (setCookieHeader) {
      // Handle multiple Set-Cookie headers
      const cookieHeadersArray = setCookieHeader.split(/,(?=\s*\w+\s*=)/);
      cookieHeadersArray.forEach(header => {
        cookieJar.setCookie(header.trim());
      });
    }

    return response;
  }) as typeof fetch;

  return { trpcClient, cookieJar };
} 