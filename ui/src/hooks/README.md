# useChatMessages Hook

## Overview

The `useChatMessages` hook provides a unified interface for managing chat messages, combining infinite query pagination with streaming message functionality. It encapsulates all the complex logic for:

- Loading messages with cursor-based pagination
- Streaming real-time message updates
- Cache management for infinite queries
- Auto-loading newer messages on window focus
- Proper handling of reverse-order display

## Key Features

### 1. **Unified API**

```typescript
const {
  messages, // Flattened array of all messages
  isLoading, // Initial loading state
  sendMessage, // Send new message with streaming
  isSending, // Message sending state
  fetchNextPage, // Load older messages
  hasNextPage, // More older messages available
  // ... other pagination states
} = useChatMessages({
  chatId: "chat-123",
  limit: 4,
  onStreamingUpdate: customHandler, // Optional custom streaming handler
});
```

### 2. **Automatic Cache Management**

The hook handles the complex infinite query cache updates, ensuring:

- New messages appear in correct order (reverse chronological)
- No duplicates in the cache
- Proper page structure maintenance
- Optimistic updates during streaming

### 3. **Smart Auto-Loading**

- **Window Focus**: Automatically loads new messages when user returns to tab
- **Continuous Loading**: Keeps loading until all available messages are fetched
- **Initial Load Protection**: Prevents unnecessary requests on first load

## Implementation Details

### Cache Update Strategy

The hook uses the exact same cache update logic as the working Chat component:

```typescript
// Creates new page at beginning of pages array (not appending to existing)
const updatedFirstPage = {
  messages: newMessages,
  direction: "backward",
  syncDate: lastMessage.createdAt,
  optimistic: true,
};

utils.message.getMessages.setInfiniteData(queryInput, {
  pages: [updatedFirstPage, ...currentData.pages],
  pageParams: [currentData.pages[0]?.syncDate, ...currentData.pageParams],
});
```

### Streaming Integration

The hook seamlessly integrates with the existing streaming mutation:

```typescript
// Default streaming handler
const handleStreamingUpdate = (chunk: StreamChunk) => {
  if (chunk.type === "userMessage") {
    addNewMessages([chunk.message]);
  } else if (chunk.type === "aiMessageStart") {
    addNewMessages([chunk.message]);
  } else if (chunk.type === "aiMessageChunk") {
    updateMessageInCache(chunk.messageId, {
      content: chunk.fullContent,
    });
  } else if (chunk.type === "aiMessageComplete") {
    updateMessageInCache(chunk.message.id, chunk.message);
  }
};
```

## Usage Examples

### Basic Usage

```typescript
const ChatComponent = () => {
  const { messages, sendMessage, isLoading } = useChatMessages({
    chatId: "chat-123",
  });

  const handleSend = (content: string) => {
    sendMessage(content, modelId);
  };

  return (
    <div>
      {messages.map((message) => (
        <MessageComponent key={message.id} message={message} />
      ))}
      <ChatInput onSend={handleSend} disabled={isLoading} />
    </div>
  );
};
```

### With Custom Streaming Handler

```typescript
const ChatWithCustomHandling = () => {
  const customStreamingHandler = (chunk: StreamChunk) => {
    // Custom logic for handling streaming updates
    console.log("Stream chunk:", chunk);
    // Still call default handler
    handleStreamingUpdate(chunk);
  };

  const { messages, sendMessage, handleStreamingUpdate } = useChatMessages({
    chatId: "chat-123",
    onStreamingUpdate: customStreamingHandler,
  });

  // ... rest of component
};
```

## Comparison with Original Implementation

### Original Chat Component (486 lines)

- Manual tRPC query setup with complex pagination logic
- Custom cache update functions (`addNewMessages`, `updateMessageInCache`)
- Manual streaming mutation handling
- Auto-loading logic scattered throughout component
- Complex state management for loading states

### With useChatMessages Hook (ChatWithHook.tsx - ~200 lines)

- Single hook call provides all functionality
- Simplified component logic focused on UI
- Built-in cache management
- Integrated streaming handling
- Cleaner separation of concerns

## Benefits

1. **Code Reusability**: Logic can be shared across multiple chat components
2. **Maintainability**: Complex logic centralized in one place
3. **Type Safety**: Proper TypeScript types for all operations
4. **Testing**: Hook can be tested independently of UI components
5. **Performance**: Optimized cache updates and auto-loading logic

## Files

- `useChatMessages.ts` - The main hook implementation
- `ChatWithHook.tsx` - Example component using the hook
- `ChatTextForm.tsx` - Updated to optionally use the hook (via `useHook` prop)

## Future Enhancements

The hook architecture makes it easy to add features like:

- Message search within the hook
- Real-time typing indicators
- Message reactions/editing
- Offline message queuing
- Custom pagination strategies
