import { QueryClient } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import localforage from "localforage";

// Configure localforage for IndexedDB
localforage.config({
  driver: localforage.INDEXEDDB,
  name: "tea4chat",
  version: 1.0,
  storeName: "queryCache",
  description: "Tea4Chat query cache storage",
});

// Create persister
export const persister = createAsyncStoragePersister({
  storage: localforage,
});

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24, // 24 hours
      staleTime: 1000 * 60 * 60, // 1 hour
      // TRPC-friendly options moved from TrpcProvider
      refetchOnWindowFocus: false, // Disable refetch on window focus
      refetchOnReconnect: true, // Keep this for network reconnection
      retry: import.meta.env?.DEV ? 1 : 3,
    },
  },
});
    