# Current Task: Streaming System Refactor

**Branch**: `add-resumable-stream-add-major-refactor`

## Current Focus
Working on streaming message functionality and resumable streams:
- Fixing streaming state handling in chat creation
- Implementing resumable stream architecture 
- Refactoring message store logic and streaming components

## Key Files Under Development
- `server/src/router/messageRouter.ts` - Core streaming logic (modified)
- `ui/src/hooks/useChatMessages/` - Client-side streaming state management

## Current Issues/TODOs
- [ ] Fix abort mechanism for streams
- [ ] Document streaming code properly
- [ ] Simplify store logic further
- [ ] Test streaming edge cases
- [ ] Fix loading indicators on chat creation

## Recent Progress
- Added resumable stream documentation and diagrams
- Refactored streaming store logic
- Fixed loading indicators
- Improved message handling and state management