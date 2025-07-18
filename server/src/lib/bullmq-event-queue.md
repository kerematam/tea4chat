**Background / concern**:
Users read an LLM’s response chunk-by-chunk in the browser. When the page is refreshed or the connection drops, the client must:

1.  Replay every chunk it _hasn’t_ seen yet.
2.  Seamlessly continue receiving new chunks—all through the same subscription.

---

### Required structure

1.  **Push layer (producer)**

    ```ts
    // one job per LLM delta
    await queue.add(
      "chunk",
      { chatId, seq, delta },
      {
        jobId: `${chatId}:${seq}`, // idempotent & ordered
        removeOnComplete: false, // keep history for replay
      }
    );
    ```

2.  **Server-side delivery (worker)**

    ```ts
    new Worker('chat-chunks', async job = {
      emitToWebSocket(job.data.chatId, job.data); // or SSE
      return job.data;                            // stored in returnvalue
    });
    ```

3.  **Retention / cleanup**

    ```ts
    // e.g. delete chunks older than 24 h every night
    await queue.clean(24 * 60 * 60 * 1000, "completed");
    ```

---

### Points to cover in your answer

- Why `removeOnComplete: false` turns each chunk into durable history.
- How `QueueEvents` (Redis Streams) lets you resume from any `lastEventId`.
- At-least-once delivery semantics and ordering via `seq`.
- Memory-retention strategies (`clean`, age-based `removeOnComplete`).
- Throughput limits—when to fall back to raw Redis Streams or Kafka.
