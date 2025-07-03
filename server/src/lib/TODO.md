Resumable-stream TODO checklist  
(Each item is phrased as an actionable task; tick when implemented and merged)

Potential correctness / race conditions  
[ ] 1. Guarantee unique, monotonic `seq` per chat (e.g. derive from `ZCARD` before `ZADD`) to prevent overwrites when multiple producers run.  
[ ] 2. Honour `stopMessageChunkStream` flag inside the producer loop and exit early.  
[ ] 3. Add client-side / server-side de-duplication so replays don’t append duplicate chunks after page refresh.

Redis usage & performance  
[ ] 4. Replace every `KEYS message-stream-*` pattern with cursor-based `SCAN`/`SSCAN` to avoid blocking the instance.  
[ ] 5. Remove the per-event string keys; keep only the sorted-set (and pub/sub) or bundle writes in a single pipeline/Lua script.  
[ ] 6. Publish events asynchronously or via pipelining to avoid back-pressure when many small chunks are sent.

Resource management  
[ ] 7. Add an abort/cancel mechanism for `subscribeToMessageChunkStream` so abandoned generators always unsubscribe and free Redis connections.  
[ ] 8. Handle Redis connection errors explicitly when `lazyConnect: true` is used.

Configuration / operations  
[ ] 9. Make TTL configurable (env var or function param) instead of the hard-coded 1 h default.  
[ ] 10. Replace cleanup’s `KEYS` scan with a safer pattern (e.g. `SCAN` + batch deletes).  
[ ] 11. Extend metrics: memory footprint, hit/miss ratio, average event size, etc.

Type-safety & API polish  
[ ] 12. Remove or implement the unused `shouldStop` field from `MessageChunkStreamData`.  
[ ] 13. Surface enqueue errors to the caller (reject promise or return status).  
[ ] 14. Switch to ULID/Snowflake IDs (monotonic & sortable) instead of `randomBytes(8)`.

Quick-win improvements  
[ ] 15. Pipeline (`multi`) or Lua-script each chunk’s `ZADD` + `PUBLISH` to cut round-trips.  
[ ] 16. Supply an optional abort signal to `subscribe…` for finer client control.  
[ ] 17. Parameterise TTL through environment variable (ties into #9).

Medium-sized enhancements  
[ ] 18. Compress stored event payloads (gzip) for long chats.  
[ ] 19. Track `playedUntil` offset per user so resume fetches only unseen events.

Larger refactors (stretch goals)  
[ ] 20. Migrate from sorted-set + pub/sub to Redis Streams with consumer groups for stronger delivery guarantees.  
[ ] 21. Implement back-pressure handling (buffer N chunks, await client ACK).  
[ ] 22. Introduce a shared typed-event schema (zod/io-ts) for run-time validation across backend & frontend.

We can tackle items in any order; recommended starting points are #4, #2, #1 and
#7 as they have the highest production impact.