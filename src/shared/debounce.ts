export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  cancel(): void;
  flush(): void;
}

/** Trailing-edge debounce. Timer functions are injectable for tests. */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  waitMs: number,
  timers: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout } = globalThis,
): Debounced<A> {
  let handle: ReturnType<typeof setTimeout> | null = null;
  let pending: A | null = null;
  const run = () => {
    handle = null;
    if (pending) {
      const args = pending;
      pending = null;
      fn(...args);
    }
  };
  const debounced = ((...args: A) => {
    pending = args;
    if (handle !== null) timers.clearTimeout(handle);
    handle = timers.setTimeout(run, waitMs);
  }) as Debounced<A>;
  debounced.cancel = () => {
    if (handle !== null) timers.clearTimeout(handle);
    handle = null;
    pending = null;
  };
  debounced.flush = () => {
    if (handle !== null) timers.clearTimeout(handle);
    run();
  };
  return debounced;
}
