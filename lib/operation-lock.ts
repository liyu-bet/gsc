/**
 * Synchronous operation lock for client forms (double-submit / double-enter).
 * Not React state — check/set before any await.
 */
export type OperationLock = {
  isLocked: () => boolean;
  tryAcquire: () => boolean;
  release: () => void;
};

export function createOperationLock(): OperationLock {
  let locked = false;
  return {
    isLocked: () => locked,
    tryAcquire: () => {
      if (locked) return false;
      locked = true;
      return true;
    },
    release: () => {
      locked = false;
    },
  };
}

/**
 * Run an async operation under a lock. If already locked, returns { ran: false }.
 */
export async function runWithOperationLock<T>(
  lock: OperationLock,
  fn: () => Promise<T>
): Promise<{ ran: true; value: T } | { ran: false }> {
  if (!lock.tryAcquire()) return { ran: false };
  try {
    const value = await fn();
    return { ran: true, value };
  } finally {
    lock.release();
  }
}
