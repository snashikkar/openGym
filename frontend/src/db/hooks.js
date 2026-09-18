import { liveQuery } from 'dexie';
import { useState, useEffect } from 'react';

/**
 * Reactive Dexie subscription hook that works seamlessly with standard React state.
 */
export function useLiveQuery(querier, deps = []) {
  const [value, setValue] = useState(undefined);

  useEffect(() => {
    let active = true;
    const observable = liveQuery(querier);
    const subscription = observable.subscribe({
      next: (val) => {
        if (active) setValue(val);
      },
      error: (err) => {
        console.error('useLiveQuery error:', err);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, deps);

  return value;
}

export { liveQuery };
