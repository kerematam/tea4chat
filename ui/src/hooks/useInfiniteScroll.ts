import { useEffect } from "react";
import { useInView } from "react-intersection-observer";

interface UseInfiniteScrollProps {
  // Fetch function
  fetchMore: () => void;
  
  // State flags
  hasMore?: boolean;
  isFetching?: boolean;
  
  // Configuration
  enabled?: boolean;
  
  // Intersection observer options
  observerArgs?: {
    rootMargin?: string;
    threshold?: number;
    root?: Element | Document | null;
    triggerOnce?: boolean;
    skip?: boolean;
    initialInView?: boolean;
  };
}

interface UseInfiniteScrollReturn {
  // Ref to attach to trigger element
  triggerRef: (node?: Element | null) => void;
  
  // In-view state (useful for conditional rendering)
  inView: boolean;
}

/**
 * A simple hook for infinite scrolling with intersection observers
 * 
 * @param props Configuration object
 * @returns Object with trigger ref and in-view state
 * 
 * @example
 * ```tsx
 * // Basic usage
 * const { triggerRef } = useInfiniteScroll({
 *   fetchMore: fetchNextPage,
 *   hasMore: hasNextPage,
 *   isFetching: isFetchingNextPage,
 * });
 * 
 * // Custom observer configuration
 * const { triggerRef } = useInfiniteScroll({
 *   fetchMore: fetchNextPage,
 *   hasMore: hasNextPage,
 *   isFetching: isFetchingNextPage,
 *   observerArgs: {
 *     rootMargin: "100px",
 *     threshold: 0.5,
 *   }
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
  enabled = true,
  observerArgs,
}: UseInfiniteScrollProps): UseInfiniteScrollReturn => {
  
  // Intersection observer for loading more content
  const { ref: triggerRef, inView } = useInView({
    rootMargin: "50px",
    threshold: 0,
    skip: !enabled,
    ...observerArgs,
  });

  // Auto-load when trigger comes into view
  useEffect(() => {
    if (!enabled || !fetchMore) return;
    
    if (!isFetching && inView && hasMore) {
      fetchMore();
    }
  }, [
    enabled,
    isFetching, 
    inView, 
    hasMore, 
    fetchMore
  ]);

  return {
    triggerRef,
    inView,
  };
};

export default useInfiniteScroll; 