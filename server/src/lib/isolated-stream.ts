/* streamlined wording: enqueue / close ---------------------------------- */

export type IsolatedStreamCallbacks<T> = {
  enqueue: (value: T) => void;   // push a chunk
  close: () => void;             // finish successfully
  error: (err: unknown) => void; // finish with failure
};

/**  Push->pull bridge backed by WHATWG ReadableStream (Node ≥ 18, browsers) */
export function createIsolatedStream<T>(
  streamingProcess: (c: IsolatedStreamCallbacks<T>) => Promise<void>
): ReadableStream<T> {
  let finished = false;

  return new ReadableStream<T>({
    start(controller) {
      const cb: IsolatedStreamCallbacks<T> = {
        enqueue: v => !finished && controller.enqueue(v),
        close: () => {
          if (!finished) {
            finished = true;
            controller.close();
          }
        },
        error: e => {
          if (!finished) {
            finished = true;
            controller.error(e);
          }
        },
      };

      (async () => {
        try {
          await streamingProcess(cb);
          if (!finished) cb.close(); // auto-close if worker forgot
        } catch (err) {
          if (!finished) cb.error(err); // auto-error if worker threw
        }
      })();
    },

    cancel() {
      finished = true; // consumer cancelled; worker keeps going silently
    },
  });
}

