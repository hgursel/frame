import type { ChatSnapshot, ChatUpdate } from '../shared/types.js';

// Requests and streaming events can arrive in a different order from their creation.
export function newerSnapshot(current: ChatSnapshot, incoming: ChatSnapshot): ChatSnapshot {
  return (incoming.revision ?? 0) < (current.revision ?? 0) ? current : incoming;
}

/**
 * Apply a full snapshot, or a streaming update to the in-progress last message. Returns
 * undefined when an update belongs to finished messages this client does not have yet;
 * the caller then fetches a full snapshot.
 */
export function applyUpdate(
  current: ChatSnapshot,
  incoming: ChatSnapshot | ChatUpdate,
): ChatSnapshot | undefined {
  if (!('tail' in incoming)) return newerSnapshot(current, incoming);
  if ((incoming.revision ?? 0) < (current.revision ?? 0)) return current;
  if (incoming.messagesVersion !== current.messagesVersion) return undefined;
  const { tail, ...rest } = incoming;
  const finished = current.streaming ? current.messages.slice(0, -1) : current.messages;
  return { ...rest, messages: tail ? [...finished, tail] : finished, streaming: !!tail };
}
