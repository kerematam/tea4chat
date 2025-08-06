# Tea4Chat – Streaming Architecture

> **Audience**: Contributors who want to understand _how_ messages are streamed through the system and which building blocks they should touch (or leave alone).
>
> **Scope**: Production paths only.  Experimental files and PoCs live in `server/src/router/streamRouter.*` and are **not** covered here.

---

## 1. Why a Hybrid Streaming System?

A chat application has two _conflicting_ requirements:

1. **Ultra-low latency** for the user who sends a brand-new message.
2. **Fault-tolerance & perfect resumption** when that user refreshes the page or opens the chat on a second device.

Pure HTTP streaming (SSE/WebSocket) solves the first problem but not the second, while a pure Redis Stream solves the second problem at the cost of additional latency/read-amplification.  Tea4Chat therefore combines both techniques and automatically picks the fastest viable path.

```
┌──────────────┐          ┌───────────────────────────┐
│  Browser JS  │────SSE──▶│  messageRouter.sendWithStream │  (ultra-fast)
└──────────────┘          └───────────────────────────┘
          ▲                           │  1s batch writes
          │          ┌────────────────▼─────────────────┐
          │          │   Redis Stream  (per-chat)       │
          │          └────────────────┬─────────────────┘
          │                           │ XPENDING / XRANGE
          │           (fallback)      ▼
          │                    ┌──────────────┐
          └────────────────────│  Browser JS  │  (re-opened tab)
                               └──────────────┘
```

*The first client receives the answer directly from the AI provider.  All other clients – or the same client after a refresh – replay the chunks from Redis.*

---

## 2. Core Flows

### 2.1 Page Visit & Resumption

```
User lands on /chat/:id
        ↓
① trpc.message.getMessages (infinite query)
        ↓
② Detects `streamingMessage`?
       ├─ No → ✨  Nothing to resume, regular pagination
       └─ Yes → ③ Start Redis listener (trpc.message.listenToMessageChunkStream)
                      • 1 second throttling
                      • Perfectly resumable from `messages.syncDate`
```

### 2.2 New Message

```
User types ↵ Enter
        ↓
trpc.message.sendWithStream.mutate({ content, chatId })
        ↓   (SSE chunks, no Redis reads)
UI renders chunks in real-time
        ↓
Background task writes chunks to Redis every 1 s
```

### 2.3 Abort / Stop

```
User clicks "Stop" button
        ↓
trpc.message.abortStream.mutate({ chatId })
        ↓
• Sets flag in streamAbortRegistry
• Isolated stream closes gracefully → UI marks message as INTERRUPTED
```

---

## 3. When Does Each Mechanism Run?

| Scenario | Mechanism | Entry point |
| -------- | --------- | ----------- |
| Brand new message | Direct SSE | `sendWithStream` |
| Page refresh while stream in‐flight | Redis replay | `listenToMessageChunkStream` |
| Second device opens the chat | Redis replay | `listenToMessageChunkStream` |
| User stops generation | Abort registry | `abortStream` |

~95 % of all requests use the **direct SSE path**.

---

## 4. Server-Side Components (TL;DR)

File | Responsibility
---- | --------------
`server/src/router/messageRouter.ts` | tRPC router exposing `sendWithStream`, `listenToMessageChunkStream`, `getMessages`, `abortStream`
`server/src/lib/redis-message/message-streaming.ts` | AI provider → Redis chunk pipeline
`server/src/lib/redis-message/stream-queue.ts` | 1 s batching, TTL handling
`server/src/lib/stream-abort-registry.ts` | In-memory registry for cooperative cancellation

> Tip: Start reading `messageRouter.ts` from bottom to top – the procedure definitions act as an index.

---

## 5. Resource Optimisation

* **Write Coalescing** – Chunks are flushed to Redis at most **once per second** via `createStreamQueue` → drastically cuts write-amplification.
* **Read-on-Demand** – Redis is only queried inside `listenToMessageChunkStream`; the hot path avoids any Redis read.
* **TTL / Cleanup** – `utils/cleanup.ts` deletes old streams after 10 minutes of inactivity, guaranteeing bounded memory usage.
* **Bi-directional Pagination** – `getMessages` supports both forward and backward pagination using date cursors, preventing cache invalidation storms.

---

## 6. Glossary

* **Streaming Message** – A `Message` row whose status is `STARTED` or `STREAMING`.
* **Chunk** – A partial AI response (string) sent to the UI as soon as it is produced.
* **Sync Date** – The timestamp the UI should use to resume a stream after reconnecting.

---

## 7. Further Reading

1. **Stream Controller API** – `docs/stream-controller.md` (high-level type-safe wrapper)
2. **Event-Sourced Streaming** – `docs/event-sourcing-streams.md` (experimental PoC)
3. **Abort Mechanism** – `docs/stream-abort-mechanism.md`

---

_Last updated: 2025-08-06_