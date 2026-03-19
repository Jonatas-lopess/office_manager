import { useEffect, useState, useCallback, useRef } from "react";

// Hook 1: useDebounce (existing)
// Good for when you want to derive a debounced value from a state.
// Note: If used at the top level with an input state, it will trigger 
// re-renders for EVERY keystroke in the parent.
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// Hook 2: useDebouncedCallback
// Better for performance - prevents the parent from re-rendering on 
// every keystroke. Used for handling input events.
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  return useCallback(
    (...args: any[]) => {
      if (timeoutRef.current) {
         clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        callback(...args);
      }, delay);
    },
    [callback, delay]
  ) as T;
}
