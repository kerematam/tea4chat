import { useEffect } from "react";
import { useInView } from "react-intersection-observer";

interface UseInfiniteScrollProps {
  // Fetch function
  fetchMore: () => void;
  
  // State flags
  hasMore?: boolean;
  isFetching?: boolean;
  
  // Configuration
  rootMargin?: string;
  threshold?: number;
  enabled?: boolean;
  
  // Debug options
  enableLogging?: boolean;
}

interface UseInfiniteScrollReturn {
  // Ref to attach to trigger element
  triggerRef: (node?: Element | null) => void;
  
  // In-view state (useful for conditional rendering)
  inView: boolean;
}

/**
 * A simple hook for unidirectional infinite scrolling
 * 
 * @param props Configuration object
 * @returns Object with trigger ref and in-view state
 * 
 * @example
 * ```tsx
 * const { triggerRef } = useInfiniteScroll({
 *   fetchMore: fetchNextPage,
 *   hasMore: hasNextPage,
 *   isFetching: isFetchingNextPage,
 * });
 * 
 * // In your JSX:
 * {items.map(item => <Item key={item.id} {...item} />)}
 * {hasNextPage && (
 *   <div ref={triggerRef}>
 *     {isFetchingNextPage ? "Loading..." : "Load more"}
 *   </div>
 * )}
 * ```
 */
export const useInfiniteScroll = ({
  fetchMore,
  hasMore = false,
  isFetching = false,
  rootMargin = "50px",
  threshold = 0,
  enabled = true,
  enableLogging = false,
}: UseInfiniteScrollProps): UseInfiniteScrollReturn => {
  
  // Intersection observer for loading more content
  const { ref: triggerRef, inView } = useInView({
    threshold,
    rootMargin,
    skip: !enabled,
  });

  // Auto-load when trigger comes into view
  useEffect(() => {
    if (!enabled || !fetchMore) return;
    
    if (!isFetching && inView && hasMore) {
      if (enableLogging) {
        console.log("Auto-loading more content - trigger in view");
      }
      fetchMore();
    }
  }, [
    enabled,
    isFetching, 
    inView, 
    hasMore, 
    fetchMore,
    enableLogging
  ]);

  return {
    triggerRef,
    inView,
  };
};

export default useInfiniteScroll; 