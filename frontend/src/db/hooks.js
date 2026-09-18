import { liveQuery } from 'dexie';

let reactModule = null;
try {
  reactModule = await import('react');
} catch (_) {
  try {
    reactModule = await import('../../../frontend/node_modules/react/index.js');
  } catch (_) {}
}

/**
 * Reactive Dexie subscription hook that works seamlessly with standard React state.
 */
export function useLiveQuery(querier, deps = []) {
  if (!reactModule || !reactModule.useState) {
    throw new Error('useLiveQuery requires React');
  }
  const { useState, useEffect } = reactModule;
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
