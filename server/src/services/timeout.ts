export class TimeoutError extends Error {
  constructor(
    public readonly label: string,
    public readonly ms: number,
  ) {
    super(`${label} did not respond within ${ms} ms`);
    this.name = 'TimeoutError';
  }
}

/**
 * Runs `task` and rejects with TimeoutError if it takes longer than `ms`.
 * The task keeps running in the background (JavaScript cannot cancel it), but its late result or
 * error is swallowed so it can never become an unhandled rejection. The timer is always cleared.
 */
export function withTimeout<T>(task: () => Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
    let promise: Promise<T>;
    try {
      promise = task();
    } catch (err) {
      clearTimeout(timer);
      reject(err);
      return;
    }
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
