import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchStreamLink } from "@trpc/client";
import { useState } from "react";
import { trpc } from "../services/trpc";

export function TrpcProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Refetch when window refocuses
            refetchOnWindowFocus: true,
            // Refetch when network reconnects
            refetchOnReconnect: true,
            // Retry failed requests
            retry: import.meta.env.DEV ? 1 : 3,
            // Stale time (how long data is considered fresh)
            staleTime: 5 * 60 * 1000, // 5 minutes
            // Cache time (how long data stays in cache after component unmounts)
            gcTime: 10 * 60 * 1000, // 10 minutes
          },
        },
      })
  );

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchStreamLink({
          url: "/trpc",
        }),
      ],
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
