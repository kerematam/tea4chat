import type { UseInfiniteQueryResult } from '@tanstack/react-query'
import { useEffect } from 'react'

interface UseRefreshLatestOnFocusOptions {
  /**
   * Whether the hook should be active
   * @default true
   */
  enabled?: boolean
  /**
   * Whether to skip refresh on initial load
   * @default true
   */
  skipInitialLoad?: boolean
  /**
   * Custom condition function to determine if refresh should happen
   */
  shouldRefresh?: () => boolean
}

/**
 * Hook that fetches the latest page of an infinite query when window regains focus.
 * This is useful for chat messages where you want to load newest messages
 * without refetching the entire history.
 * 
 * @param infiniteQuery - The infinite query result from useInfiniteQuery
 * @param options - Configuration options
 */
export function useRefreshLatestOnFocus(
  infiniteQuery: UseInfiniteQueryResult<unknown, unknown>,
  options: UseRefreshLatestOnFocusOptions = {}
) {
  const {
    enabled = true,
    skipInitialLoad = true,
    shouldRefresh
  } = options

  useEffect(() => {
    if (!enabled) return

    const handleWindowFocus = () => {
      // Skip if query is not in a good state
      if (!infiniteQuery.isSuccess) return
      
      // Skip if already fetching to prevent race conditions
      if (infiniteQuery.isFetchingPreviousPage) return
      
      // Skip if initial load and skipInitialLoad is true
      if (skipInitialLoad && !infiniteQuery.isFetched) return
      
      // Custom condition check
      if (shouldRefresh && !shouldRefresh()) return
      
      // All checks passed, fetch the latest page
      infiniteQuery.fetchPreviousPage()
    }

    window.addEventListener('focus', handleWindowFocus)
    return () => window.removeEventListener('focus', handleWindowFocus)
  }, [infiniteQuery, enabled, skipInitialLoad, shouldRefresh])
} 