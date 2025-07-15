import { useState } from "react";

/**
 * Custom hook to handle value changes without using useEffect. Inspired by the
 * 'You Might Not Need an Effect' article from the React documentation.
 *
 * URL:
 * https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
 *
 */
const useValueChange = <T>(value: T, callback: (value: T, prev: T) => void) => {
    const [prev, setPrev] = useState<T>(value);
    
    if (prev !== value) {
        callback(value, prev);
        setPrev(value);
    }
};

export default useValueChange;
