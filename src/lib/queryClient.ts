/**
 * TanStack Query Client
 *
 * Singleton instance used for cache invalidation and mutation operations
 * throughout the application.
 */

import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});
