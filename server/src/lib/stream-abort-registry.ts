/**
 * Stream Abort Registry
 * 
 * Manages active streaming operations and provides a way to abort them
 * from external requests. Each stream is identified by a unique key
 * (typically chatId + ownerId combination).
 */

export class StreamAbortRegistry {
  private static instance: StreamAbortRegistry;
  private activeStreams = new Map<string, AbortController>();

  private constructor() {}

  static getInstance(): StreamAbortRegistry {
    if (!StreamAbortRegistry.instance) {
      StreamAbortRegistry.instance = new StreamAbortRegistry();
    }
    return StreamAbortRegistry.instance;
  }

  /**
   * Register a new streaming operation
   */
  register(streamId: string): AbortController {
    // If there's already a stream with this ID, abort it first
    this.abort(streamId);

    const controller = new AbortController();
    this.activeStreams.set(streamId, controller);
    
    // Auto-cleanup when aborted
    controller.signal.addEventListener('abort', () => {
      this.activeStreams.delete(streamId);
    });

    return controller;
  }

  /**
   * Abort a streaming operation by ID
   */
  abort(streamId: string): boolean {
    const controller = this.activeStreams.get(streamId);
    if (controller && !controller.signal.aborted) {
      controller.abort();
      this.activeStreams.delete(streamId);
      return true;
    }
    return false;
  }

  /**
   * Check if a stream is currently active
   */
  isActive(streamId: string): boolean {
    const controller = this.activeStreams.get(streamId);
    return controller ? !controller.signal.aborted : false;
  }

  /**
   * Get all active stream IDs
   */
  getActiveStreamIds(): string[] {
    return Array.from(this.activeStreams.keys());
  }

  /**
   * Clean up completed or errored streams
   */
  cleanup(streamId: string): void {
    this.activeStreams.delete(streamId);
  }

  /**
   * Get the abort signal for a stream (for checking if aborted)
   */
  getSignal(streamId: string): AbortSignal | null {
    const controller = this.activeStreams.get(streamId);
    return controller?.signal || null;
  }
}

// Export singleton instance
export const streamAbortRegistry = StreamAbortRegistry.getInstance();

// Helper function to create stream ID
export const createStreamId = (chatId: string, ownerId: string): string => {
  return `${chatId}:${ownerId}`;
}; 