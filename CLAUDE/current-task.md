Refactor: Model Selector + Model selection flow

What changed
- ModelSelector now supports both new and existing chats with an explicit mode toggle using a Switch (default vs. local per chat).
- No implicit default updates. Users must explicitly toggle to "Set as default" and click Save to update default.
- For existing chats, Save updates only that chat’s local model when default switch is OFF.
- For new chats (no chatId), Save does not touch defaults. Instead, it bubbles the selection up so the first sendWithStream carries modelId.
- New chat page renders ModelSelector and passes selected model to ChatTextForm.
- ChatTextForm accepts overrideModelId and includes it in sendWithStream.
- Server sendWithStream persists local model when modelId is provided:
  - New chat: creates chat with modelId so it’s the chat’s local override.
  - Existing chat: updates chat.modelId if modelId is provided before streaming.

Why
- Keep clear separation between default and local modes.
- Allow choosing a model before first message without modifying defaults.
- Ensure chat-local persistence so a chat stays on its model regardless of future default changes.

Files
- server/src/router/messageRouter.ts
  - Persist local model when modelId is provided (on create and existing chat).
  - Add `text` to MessageType for consistency with Redis stream types.
- ui/src/pages/Chat/components/ModelSelector/ModelSelector.tsx
  - Reintroduced temp selection, Switch toggle, explicit Save.
  - For new chat: emits local selection via onLocalSelectionChange; no default writes.
- ui/src/pages/Chat/Chat.tsx
  - Added state `newChatModelId`; wired ModelSelector -> ChatTextForm.
- ui/src/components/ChatTextForm/ChatTextForm.tsx
  - Added `overrideModelId`; prefer it when sending message.

Testing notes
- New chat: pick model (default switch OFF) → send first message → server creates chat and persists modelId locally.
- Existing chat: pick model (default switch OFF) → Save → chat model updates; sending uses the selected model.
- Default change: toggle ON and Save → default updates; no existing chat with a local model should change.
