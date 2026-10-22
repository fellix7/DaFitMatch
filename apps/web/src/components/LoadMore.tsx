import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';

export interface LoadMoreProps {
  /** Whether more pages exist. */
  hasMore: boolean;
  /** Whether a page is currently loading. */
  isLoading: boolean;
  /** Called when the sentinel scrolls into view (or the button is pressed). */
  onLoadMore: () => void;
  /** Label of the fallback button. */
  label?: string;
}

/**
 * Infinite-scroll sentinel.
 *
 * The button stays as a fallback (and for keyboard users); when it is on screen the next page
 * is requested automatically. Browsers without IntersectionObserver simply get the button.
 */
export function LoadMore({ hasMore, isLoading, onLoadMore, label = 'Load more' }: LoadMoreProps) {
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasMore || isLoading) return;
    const node = sentinel.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onLoadMore();
      },
      { rootMargin: '400px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, isLoading, onLoadMore]);

  if (!hasMore) return null;

  return (
    <div ref={sentinel} className="flex justify-center py-2">
      <Button variant="outline" disabled={isLoading} onClick={onLoadMore}>
        {isLoading ? 'Loading…' : label}
      </Button>
    </div>
  );
}
