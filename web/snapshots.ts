import type { ChatSnapshot } from '../shared/types.js';

// Requests and streaming events can arrive in a different order from their creation.
export function newerSnapshot(current: ChatSnapshot, incoming: ChatSnapshot): ChatSnapshot {
  return (incoming.revision ?? 0) < (current.revision ?? 0) ? current : incoming;
}
