import { useState, useEffect, useRef, useCallback } from "react";

/**
 * A hook that handles infinite scrolling by slicing a data array and
 * providing an IntersectionObserver ref for a "sentinel" element.
 */
export function useInfiniteScroll<T>(data: T[], pageSize: number = 20) {
  const [limit, setLimit] = useState(pageSize);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Reset limit when data changes (e.g. search/filter results change)
  useEffect(() => {
    setLimit(pageSize);
  }, [data.length, pageSize]);

  const lastElementRef = useCallback(
    (node: HTMLElement | null) => {
      if (observerRef.current) observerRef.current.disconnect();

      observerRef.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && limit < data.length) {
          setLimit((prev) => prev + pageSize);
        }
      });

      if (node) observerRef.current.observe(node);
    },
    [limit, data.length, pageSize]
  );

  return {
    items: data.slice(0, limit),
    lastElementRef,
    hasMore: limit < data.length,
  };
}
