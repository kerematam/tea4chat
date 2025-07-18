import { httpBatchStreamLink } from "@trpc/client";
import { useState } from "react";
import { queryClient } from "../services/queryClient";
import { trpc } from "../services/trpc";

export function TrpcProvider({ children }: { children: React.ReactNode }) {
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
      {children}
    </trpc.Provider>
  );
}
