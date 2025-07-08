import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { Query, QueryClient } from "@tanstack/react-query";
import localforage from "localforage";

// Configure localforage for IndexedDB
localforage.config({
  driver: localforage.INDEXEDDB,
  name: "tea4chat",
  version: 1.0,
  storeName: "queryCache",
  description: "Tea4Chat query cache storage",
});

// Create persister with selective hydration/dehydration
export const persister = createAsyncStoragePersister({
  storage: localforage,
  // Only persist message queries
  // serialize: (data) => JSON.stringify(data),
  // deserialize: (data) => JSON.parse(data),
});

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24, // 24 hours
      staleTime: 1000 * 60 * 60 * 24 * 7, // 7 days - longer for offline-first
      // TRPC-friendly options moved from TrpcProvider
      refetchOnWindowFocus: false, // Disable refetch on window focus
      refetchOnReconnect: true, // Keep this for network reconnection
      retry: import.meta.env?.DEV ? 1 : 3,
      // Offline-first settings
      networkMode: 'offlineFirst', // Try cache first, then network
      refetchOnMount: false, // Use cached data on mount
      // retryOnMount: false, // Don't retry failed queries on mount

    },
    mutations: {
      // Offline-first mutation settings
      // networkMode: 'offlineFirst',
      retry: (failureCount, error: unknown) => {
        // Don't retry if offline
        if (!navigator.onLine) return false;
        // Retry up to 3 times for network errors
        return failureCount < 3 && ((error as { status?: number })?.status ?? 0) >= 500;
      },
    },
  },
});

// Configure what queries to persist - only message queries
export const persistOptions = {
  persister,
  maxAge: 86400000, // 24 hours
  dehydrateOptions: {
    shouldDehydrateQuery: (query: Query) => {
      const queryKey = query.queryKey;

      // TODO: Uncomment when resuming streaming development complete
      // if (Array.isArray(queryKey) && Array.isArray(queryKey[0])) {
      //   const [procedure] = queryKey[0];

      //   return procedure === "message";
      // }

      return false;
    },
  },
};
