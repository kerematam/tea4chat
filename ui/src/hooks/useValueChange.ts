import { useLayoutEffect, useRef } from "react";

/**
 * Custom hook to handle value changes.
 */
const useValueChange = <T>(value: T, callback: (value: T, prev: T) => void) => {
  const prevRef = useRef<T>(value);
  const callbackRef = useRef<((value: T, prev: T) => void) | null>(callback);

  useLayoutEffect(() => {
    if (prevRef.current !== value) {
      const previous = prevRef.current;
      prevRef.current = value;
      callbackRef.current?.(value, previous);
    }
  }, [value]);
};

export default useValueChange;
