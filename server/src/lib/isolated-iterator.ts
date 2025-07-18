/**
 * Type definitions for better developer experience
 */
export type IsolatedIteratorCallbacks<T> = {
  emit: (value: T) => void;
  complete: () => void;
  error: (err: unknown) => void;
};

/**
 * Isolated Iterator Utility
 * 
 * Decouples streaming operations from client connection lifecycle.
 * When a request is broken mid-stream, the background task continues
 * to process the stream and complete necessary operations (DB updates, etc.)
 * while the client iterator gracefully handles disconnection.
 */

export function createIsolatedIterator<T>(
  streamingProcess: (callbacks: IsolatedIteratorCallbacks<T>) => Promise<void>
): AsyncIterator<T> & AsyncIterable<T> {
  type Resolver = (v: IteratorResult<T>) => void;
  type Rejecter = (err: unknown) => void;

  let queue: T[] = [];
  let done = false;
  let nextResolver: Resolver | null = null;
  let nextRejecter: Rejecter | null = null;
  let recordedError: unknown = null;

  // Callbacks passed to the background worker
  const callbacks: IsolatedIteratorCallbacks<T> = {
    emit(value: T) {
      if (done) return; // ignore late emits
      
      if (nextResolver) {
        // Someone is waiting for the next value
        nextResolver({ value, done: false });
        nextResolver = null;
        nextRejecter = null;
      } else {
        // Queue the value for later consumption
        queue.push(value);
      }
    },
    
    complete() {
      done = true;
      if (nextResolver) {
        nextResolver({ value: undefined as any, done: true });
        nextResolver = null;
        nextRejecter = null;
      }
    },
    
    error(err: unknown) {
      done = true;
      recordedError = err;
      if (nextRejecter) {
        nextRejecter(err);
        nextResolver = null;
        nextRejecter = null;
      }
    },
  };

  // Start the background streaming process immediately (don't await it!)
  (async () => {
    try {
      await streamingProcess(callbacks);
      // If the process completes without calling complete(), call it automatically
      if (!done) {
        callbacks.complete();
      }
    } catch (error) {
      // If the process throws without calling error(), call it automatically
      if (!done) {
        callbacks.error(error);
      }
    }
  })();

  // The async iterator exposed to the consumer (TRPC generator)
  const iterator: AsyncIterator<T> & AsyncIterable<T> = {
    async next(): Promise<IteratorResult<T>> {
      // If there's already an item enqueued, send it immediately
      if (queue.length > 0) {
        return { value: queue.shift()!, done: false };
      }

      // If worker has finished, propagate completion or error
      if (done) {
        if (recordedError) {
          throw recordedError;
        }
        return { value: undefined as any, done: true };
      }

      // Otherwise wait until the worker pushes something
      return new Promise<IteratorResult<T>>((resolve, reject) => {
        nextResolver = resolve;
        nextRejecter = reject;
      });
    },

    // Optional return() so that the worker can detect cancellation
    async return(): Promise<IteratorResult<T>> {
      done = true;
      // Clear any pending resolvers
      if (nextResolver) {
        nextResolver({ value: undefined as any, done: true });
        nextResolver = null;
        nextRejecter = null;
      }
      return { value: undefined as any, done: true };
    },

    // Make it a proper async iterator
    [Symbol.asyncIterator]() {
      return this;
    },
  };

  return iterator;
}
